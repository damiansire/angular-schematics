import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { scaffold } from '../utils/scaffold';

export interface HttpInterceptorOptions {
  /** Interceptor name (e.g. 'auth' -> authInterceptor in auth.interceptor.ts). */
  name: string;
  /** Target directory, relative to the project root (default 'src/app'). */
  path?: string;
  /** Number of retries on transient (5xx / network) errors (default 2). */
  retries?: number;
}

/**
 * Generates a functional `HttpInterceptorFn` with built-in error handling and a
 * configurable retry for transient failures (5xx / network). Functional
 * interceptors are the modern Angular default and plug into
 * `provideHttpClient(withInterceptors([...]))`.
 */
export function httpInterceptor(options: HttpInterceptorOptions): Rule {
  return (_tree: Tree, _context: SchematicContext): Rule => {
    const targetPath = '/' + (options.path ?? 'src/app').replace(/^\/+|\/+$/g, '');
    // Clamp to a sane, non-negative integer so the template never emits retry(NaN).
    const retries = Number.isFinite(options.retries)
      ? Math.max(0, Math.floor(options.retries as number))
      : 2;

    return scaffold('./files', { name: options.name, retries }, targetPath);
  };
}
