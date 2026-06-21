import { apply, applyTemplates, mergeWith, move, Rule, url } from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';
import { normalize } from 'path';

/**
 * Shared scaffolding pipeline used by every generator in this package:
 * read the `./files` templates, interpolate `strings` + the caller's vars,
 * move the result to `targetPath` and merge it into the tree.
 *
 * Centralizing this removes the `apply/applyTemplates/move/mergeWith` boilerplate
 * that was copied verbatim across the generators.
 *
 * @param filesUrl     Template directory URL, typically `'./files'`.
 * @param templateVars Variables exposed to the templates (merged on top of `strings`).
 * @param targetPath   Destination directory; normalized before `move`.
 */
export function scaffold(
  filesUrl: string,
  templateVars: Record<string, unknown>,
  targetPath: string,
): Rule {
  const source = apply(url(filesUrl), [
    applyTemplates({ ...strings, ...templateVars }),
    move(normalize(targetPath)),
  ]);
  return mergeWith(source);
}
