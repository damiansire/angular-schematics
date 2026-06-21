import {
  apply,
  applyTemplates,
  mergeWith,
  move,
  Rule,
  SchematicContext,
  Tree,
  url,
} from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';
import { normalize } from 'path';

export interface SignalStoreOptions {
  /** Store name (e.g. 'cart' -> CartStore in cart.store.ts). */
  name: string;
  /** Target directory, relative to the project root (default 'src/app'). */
  path?: string;
  /** TypeScript type of the entity held in state (default 'unknown'). */
  entity?: string;
}

/**
 * Generates a signals-based store service: a private WritableSignal holding the
 * state, `computed` selectors and immutable update methods. Modelled after the
 * `withState` pattern so consuming components read reactive signals instead of
 * subscribing to streams.
 */
export function signalStore(options: SignalStoreOptions): Rule {
  return (_tree: Tree, _context: SchematicContext): Rule => {
    const targetPath = '/' + (options.path ?? 'src/app').replace(/^\/+|\/+$/g, '');
    const entity =
      options.entity && options.entity.trim().length > 0 ? options.entity.trim() : 'unknown';

    const templateSource = apply(url('./files'), [
      applyTemplates({
        ...strings,
        name: options.name,
        entity,
      }),
      move(normalize(targetPath)),
    ]);

    return mergeWith(templateSource);
  };
}
