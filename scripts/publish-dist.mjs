// Publica el dist/ de cada paquete del monorepo, sólo si su versión aún no
// está en npm. Evita el footgun de "republicar una versión existente" (que
// haría fallar todo el release) cuando un changeset bumpeó únicamente a uno
// de los paquetes. Pensado para correr tras `npm run build --workspaces`.
//
// `--dry-run` recorre y consulta el registry igual, pero no publica nada: es la
// forma de ejercitar este script (incluido en Windows) sin efectos.
import { readFileSync } from 'node:fs';
import { runNpm } from './npm-cli.mjs';

const packages = ['angular-inline-migration-schematic', 'angular-generators-schematic'];
const dryRun = process.argv.includes('--dry-run');

let publishedAny = false;

for (const pkg of packages) {
  const distDir = `packages/${pkg}/dist`;
  const { name, version } = JSON.parse(readFileSync(`${distDir}/package.json`, 'utf8'));

  let onNpm = '';
  try {
    // stderr capturado (no heredado) para poder CLASIFICAR el fallo abajo.
    onNpm = runNpm(['view', `${name}@${version}`, 'version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    // `npm view` sale con código !=0 por MUCHOS motivos: versión inexistente,
    // pero también ENEEDAUTH, E403, registry caído o un spawn fallido. Tragarlos
    // todos convertía cualquier fallo transitorio en "no está publicado", que es
    // justo el footgun que este script viene a prevenir. Sólo un 404 real
    // significa "todavía no está en npm".
    const output = `${String(error.stderr ?? '')}${String(error.stdout ?? '')}${error.message ?? ''}`;
    if (!/E404|404 Not Found/.test(output)) {
      throw new Error(`No se pudo consultar ${name}@${version} en npm: ${output.trim()}`, {
        cause: error,
      });
    }
    onNpm = '';
  }

  if (onNpm === version) {
    console.log(`skip  ${name}@${version} (ya está en npm)`);
    continue;
  }

  if (dryRun) {
    console.log(`dry-run  publicaría ${name}@${version} desde ${distDir}`);
    publishedAny = true;
    continue;
  }

  console.log(`publish ${name}@${version}`);
  try {
    runNpm(['publish', distDir, '--access', 'public'], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`publish falló para ${name}@${version}`, { cause: error });
  }
  publishedAny = true;
}

if (!publishedAny) {
  console.log('Nada para publicar: todas las versiones ya están en npm.');
}
