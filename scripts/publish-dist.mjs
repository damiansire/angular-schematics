// Publica el dist/ de cada paquete del monorepo, sólo si su versión aún no
// está en npm. Evita el footgun de "republicar una versión existente" (que
// haría fallar todo el release) cuando un changeset bumpeó únicamente a uno
// de los paquetes. Pensado para correr tras `npm run build --workspaces`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packages = ['angular-inline-migration-schematic', 'angular-generators-schematic'];

let publishedAny = false;

for (const pkg of packages) {
  const distDir = `packages/${pkg}/dist`;
  const { name, version } = JSON.parse(readFileSync(`${distDir}/package.json`, 'utf8'));

  let onNpm = '';
  try {
    onNpm = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    // `npm view` sale con código !=0 si la versión (o el paquete) no existe aún.
    onNpm = '';
  }

  if (onNpm === version) {
    console.log(`skip  ${name}@${version} (ya está en npm)`);
    continue;
  }

  console.log(`publish ${name}@${version}`);
  execFileSync('npm', ['publish', distDir, '--access', 'public'], {
    stdio: 'inherit',
  });
  publishedAny = true;
}

if (!publishedAny) {
  console.log('Nada para publicar: todas las versiones ya están en npm.');
}
