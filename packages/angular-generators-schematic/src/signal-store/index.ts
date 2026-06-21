import { Rule, SchematicContext, SchematicsException, Tree } from '@angular-devkit/schematics';
import { scaffold } from '../utils/scaffold';

export interface SignalStoreOptions {
  /** Store name (e.g. 'cart' -> CartStore in cart.store.ts). */
  name: string;
  /** Target directory, relative to the project root (default 'src/app'). */
  path?: string;
  /** TypeScript type of the entity held in state (default 'unknown'). */
  entity?: string;
}

/**
 * A type reference safe to inline verbatim into the generated `.ts`: an
 * identifier optionally followed by member access, generics or array suffixes
 * (`Product`, `Product[]`, `Map<string, Product>`, `models.Product`). Rejects
 * anything carrying `;`, `{`, quotes or newlines that could break out of the
 * type position and inject statements into the produced file.
 */
const ENTITY_TYPE = /^[A-Za-z_$][A-Za-z0-9_$.<>[\], ]*$/;

/**
 * Generates a signals-based store service: a private WritableSignal holding the
 * state, `computed` selectors and immutable update methods. Modelled after the
 * `withState` pattern so consuming components read reactive signals instead of
 * subscribing to streams.
 */
export function signalStore(options: SignalStoreOptions): Rule {
  return (_tree: Tree, _context: SchematicContext): Rule => {
    const targetPath = '/' + (options.path ?? 'src/app').replace(/^\/+|\/+$/g, '');
    const rawEntity = options.entity?.trim() ?? '';
    if (rawEntity.length > 0 && !ENTITY_TYPE.test(rawEntity)) {
      throw new SchematicsException(
        `Invalid "entity" type: ${JSON.stringify(options.entity)}. ` +
          `Expected a TypeScript type reference such as "Product", "Product[]" ` +
          `or "Map<string, Product>".`,
      );
    }
    const entity = rawEntity.length > 0 ? rawEntity : 'unknown';

    return scaffold('./files', { name: options.name, entity }, targetPath);
  };
}
