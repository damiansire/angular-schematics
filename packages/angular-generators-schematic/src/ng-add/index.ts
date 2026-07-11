import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';

/**
 * `ng add` entry point. This package ships plain generator schematics (no
 * runtime dependency to wire into the consuming app), so there is no project
 * file to touch: `ng add` only needs to add the dependency to `package.json`,
 * which the Angular CLI already does before running this schematic. This
 * factory is a no-op that just confirms the install and points at the
 * available generators.
 */
export function ngAdd(): Rule {
  return (_tree: Tree, context: SchematicContext): Tree => {
    context.logger.info(
      'angular-generators-schematic installed. Available generators: ' +
        'ng generate angular-generators-schematic:signal-store, ' +
        ':http-interceptor, :smart-dumb.',
    );
    return _tree;
  };
}
