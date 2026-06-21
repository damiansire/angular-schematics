import {
  apply,
  applyTemplates,
  mergeWith,
  move,
  Rule,
  SchematicContext,
  Tree,
  url,
} from "@angular-devkit/schematics";
import { strings } from "@angular-devkit/core";
import { join, normalize } from "path";

export interface SmartDumbOptions {
  /** Base name of the pair (e.g. 'user-list'). */
  name: string;
  /** Target directory, relative to the project root (default 'src/app'). */
  path?: string;
  /** Selector prefix (default 'app'). */
  prefix?: string;
}

/**
 * Generates a paired smart (container) + dumb (presentational) standalone
 * component set, already wired together: the container owns the state and
 * renders the presentational component, passing data via inputs and reacting to
 * its outputs. The pair lives in a folder named after `name`.
 */
export function smartDumb(options: SmartDumbOptions): Rule {
  return (_tree: Tree, _context: SchematicContext): Rule => {
    const basePath = "/" + (options.path ?? "src/app").replace(/^\/+|\/+$/g, "");
    const prefix = options.prefix && options.prefix.trim().length > 0 ? options.prefix.trim() : "app";
    // Group the pair in a dedicated folder so the two components stay together.
    const targetPath = normalize(join(basePath, strings.dasherize(options.name)));

    const templateSource = apply(url("./files"), [
      applyTemplates({
        ...strings,
        name: options.name,
        prefix,
      }),
      move(targetPath),
    ]);

    return mergeWith(templateSource);
  };
}
