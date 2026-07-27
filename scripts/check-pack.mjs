// Gate de contenidos del tarball: verifica lo que CRUZA el borde publicado.
// El `files` de cada package.json es un espejo manual del layout, y un espejo se
// rompe en silencio: ni el build ni los tests notan que falta el .js de un
// factory (el consumidor sí, con "factory not found" al correr `ng generate`) ni
// que se colaron specs. Este script corre `npm pack --dry-run` sobre cada dist/
// y falla si el tarball no cumple lo que collection.json promete.
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runNpm } from './npm-cli.mjs';

const packages = ['angular-inline-migration-schematic', 'angular-generators-schematic'];

/** Todos los archivos bajo `dir`, con path relativo y separadores POSIX. */
function walk(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full, root) : [relative(root, full).split('\\').join('/')];
  });
}

const problems = [];

for (const pkg of packages) {
  const distDir = `packages/${pkg}/dist`;
  const [result] = JSON.parse(runNpm(['pack', '--dry-run', '--json', distDir]));
  const packed = new Set(result.files.map((file) => file.path));

  const specs = [...packed].filter((path) => /_spec\./.test(path));
  if (specs.length > 0) {
    problems.push(`${pkg}: el tarball incluye tests (${specs.join(', ')})`);
  }

  const collection = JSON.parse(readFileSync(`${distDir}/collection.json`, 'utf8'));
  for (const [name, schematic] of Object.entries(collection.schematics)) {
    const factory = schematic.factory.split('#')[0].replace(/^\.\//, '');
    const candidates = [`${factory}.js`, `${factory}/index.js`];
    if (!candidates.some((candidate) => packed.has(candidate))) {
      problems.push(
        `${pkg}: el schematic "${name}" apunta a ${schematic.factory} y su .js no está en el tarball`,
      );
    }
    const schema = schematic.schema?.replace(/^\.\//, '');
    if (schema && !packed.has(schema)) {
      problems.push(`${pkg}: falta el schema ${schema} del schematic "${name}"`);
    }
  }

  // Las plantillas son el producto de los generadores: sin ellas el schematic
  // resuelve pero no puede escribir nada.
  for (const file of walk(distDir)) {
    if (file.endsWith('.template') && !packed.has(file)) {
      problems.push(`${pkg}: falta la plantilla ${file} en el tarball`);
    }
  }

  console.log(`ok  ${pkg}: ${packed.size} archivos en el tarball`);
}

if (problems.length > 0) {
  console.error('\nEl contenido publicable no cumple el contrato:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}
