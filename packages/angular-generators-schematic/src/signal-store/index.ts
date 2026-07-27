import {
  type Rule,
  type SchematicContext,
  SchematicsException,
  type Tree,
} from '@angular-devkit/schematics';
import { scaffold } from '../utils/scaffold';
import { validateName } from '../utils/validate-name';

export interface SignalStoreOptions {
  /** Store name (e.g. 'cart' -> CartStore in cart.store.ts). */
  name: string;
  /** Target directory, relative to the project root (default 'src/app'). */
  path?: string;
  /** TypeScript type of the entity held in state (default 'unknown'). */
  entity?: string;
  /** Module the entity type is imported from (e.g. './product.model'). */
  entityImport?: string;
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
 * True when `type` carries a comma OUTSIDE any `<...>` / `[...]`, i.e. two types
 * where one is expected. The character-class check above cannot see nesting, so
 * `"A, B"` used to pass it and emit `items: A, B[];`, which does not even parse.
 */
function hasTopLevelComma(type: string): boolean {
  let depth = 0;
  for (const char of type) {
    if (char === '<' || char === '[') {
      depth++;
    } else if (char === '>' || char === ']') {
      depth--;
    } else if (char === ',' && depth <= 0) {
      return true;
    }
  }
  return false;
}

/**
 * Type names the generated file references but does not define: everything the
 * emitted code needs imported. Built-ins are dropped, and a qualified name
 * contributes its root (`models.Product` -> `models`).
 */
function externalTypeNames(type: string): string[] {
  const BUILT_IN = new Set([
    'unknown',
    'any',
    'never',
    'void',
    'null',
    'undefined',
    'string',
    'number',
    'boolean',
    'bigint',
    'symbol',
    'object',
    'Date',
    'Array',
    'ReadonlyArray',
    'Map',
    'ReadonlyMap',
    'Set',
    'ReadonlySet',
    'Record',
    'Partial',
    'Readonly',
    'Promise',
  ]);
  const names = new Set<string>();
  for (const match of type.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/g)) {
    const root = match[0].split('.')[0];
    if (root && !BUILT_IN.has(root)) {
      names.add(root);
    }
  }
  return [...names];
}

/**
 * Generates a signals-based store service: a private WritableSignal holding the
 * state, `computed` selectors and immutable update methods. Modelled after the
 * `withState` pattern so consuming components read reactive signals instead of
 * subscribing to streams.
 */
export function signalStore(options: SignalStoreOptions): Rule {
  return (_tree: Tree, _context: SchematicContext): Rule => {
    validateName(options.name);
    const targetPath = '/' + (options.path ?? 'src/app').replace(/^\/+|\/+$/g, '');
    const rawEntity = options.entity?.trim() ?? '';
    if (rawEntity.length > 0 && (!ENTITY_TYPE.test(rawEntity) || hasTopLevelComma(rawEntity))) {
      throw new SchematicsException(
        `Invalid "entity" type: ${JSON.stringify(options.entity)}. ` +
          `Expected a single TypeScript type reference such as "Product", "Product[]" ` +
          `or "Map<string, Product>".`,
      );
    }
    // The template already appends `[]` for the collection, so an entity written
    // as `Product[]` (documented as valid) must not become `Product[][]`.
    const entity = rawEntity.length > 0 ? rawEntity.replace(/\s*\[\s*\]\s*$/, '') : 'unknown';

    const entityImport = options.entityImport?.trim() ?? '';
    const importedTypes = externalTypeNames(entity);
    if (importedTypes.length > 0 && entityImport.length === 0) {
      // Emitting a type the file never imports produces TS2304 on the consumer's
      // first build. Refuse instead, naming the flag that fixes it.
      throw new SchematicsException(
        `The "entity" type ${JSON.stringify(entity)} is not built in, so the generated ` +
          `store would reference ${importedTypes.join(', ')} without importing it. ` +
          `Pass --entity-import with the module that exports it ` +
          `(e.g. --entity Product --entity-import ./product.model), or omit --entity.`,
      );
    }

    return scaffold(
      './files',
      { name: options.name, entity, entityImport, entityTypes: importedTypes.join(', ') },
      targetPath,
    );
  };
}
