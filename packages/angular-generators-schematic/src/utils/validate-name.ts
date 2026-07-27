import { SchematicsException } from '@angular-devkit/schematics';

/**
 * The `name` every generator turns into class names, file names and selectors.
 * Anything outside this shape ends up interpolated verbatim into TypeScript and
 * into a file path: a quote produced `export interface Cart';ConstX=1;//State`,
 * and a `../` produced a raw devkit path error instead of an actionable message.
 */
const NAME = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

/**
 * Rejects a `name` that cannot be safely turned into an identifier and a file
 * name, BEFORE anything is written. Mirrors the `pattern` declared in each
 * schema.json so the guard also holds when a factory is called directly (the
 * schema only runs through the Angular CLI).
 *
 * @throws SchematicsException when `name` is empty or malformed.
 */
export function validateName(name: string | undefined): void {
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new SchematicsException(
      `Invalid "name": ${JSON.stringify(name)}. ` +
        `Expected a name starting with a letter and made of letters, digits, ` +
        `".", "_" or "-" (e.g. "cart", "user-list").`,
    );
  }
}
