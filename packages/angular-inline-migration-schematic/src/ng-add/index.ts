import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';

/**
 * `ng add` entry point. This package only exposes a one-off migration
 * schematic (no runtime dependency or config to wire into the consuming
 * app), so there is nothing for `ng add` to scaffold: the Angular CLI has
 * already added the dependency to `package.json` before invoking this
 * schematic. This factory is a no-op that confirms the install and points
 * at how to run the migration.
 */
export function ngAdd(): Rule {
  return (_tree: Tree, context: SchematicContext): Tree => {
    context.logger.info(
      'angular-inline-migration-schematic installed. Run the migration with: ' +
        'ng generate angular-inline-migration-schematic:inline-migration',
    );
    return _tree;
  };
}
