// Cómo invocar npm desde un script de Node sin que el entorno decida si funciona.
// En Windows `npm` es `npm.cmd`: `execFileSync('npm', ...)` da ENOENT, y pasarle
// `npm.cmd` directo da EINVAL desde el fix de CVE-2024-27980. El camino que sí
// funciona en las dos plataformas es ejecutar el propio CLI de npm con el Node
// que ya está corriendo, que es lo que `npm_execpath` expone dentro de un script
// de npm.
import { execFileSync } from 'node:child_process';

/**
 * Corre `npm <args>` y devuelve su stdout.
 *
 * @param {string[]} args Argumentos para npm (sin la palabra `npm`).
 * @param {import('node:child_process').ExecFileSyncOptions} [options]
 * @returns {string} stdout del comando.
 */
export function runNpm(args, options = {}) {
  const cli = process.env.npm_execpath;
  if (cli && cli.endsWith('.js')) {
    return execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...options });
  }
  // Fuera de un script de npm no hay `npm_execpath`; ahí sí hace falta el shell
  // para resolver `npm.cmd` en Windows.
  return execFileSync('npm', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
}
