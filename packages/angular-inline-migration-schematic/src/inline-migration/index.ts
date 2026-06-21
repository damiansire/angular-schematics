import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { dirname, join, basename, normalize } from 'path';
import * as ts from 'typescript';

// --- Helper Functions Restored ---

/**
 * Finds the ObjectLiteralExpression node within the @Component decorator.
 */
function findComponentDecorator(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
  let componentDecorator: ts.ObjectLiteralExpression | null = null;

  function visitNode(node: ts.Node) {
    // Use ts.canHaveDecorators to check if the node can have decorators (more modern)
    if (ts.canHaveDecorators && ts.canHaveDecorators(node) && ts.isClassDeclaration(node)) {
      const decorators = ts.getDecorators(node);
      if (decorators) {
        for (const decorator of decorators) {
          if (ts.isCallExpression(decorator.expression)) {
            const expression = decorator.expression;
            if (
              ts.isIdentifier(expression.expression) &&
              expression.expression.text === 'Component'
            ) {
              if (
                expression.arguments.length > 0 &&
                ts.isObjectLiteralExpression(expression.arguments[0])
              ) {
                componentDecorator = expression.arguments[0];
                return; // Found, stop searching
              }
            }
          }
        }
      }
    }
    if (!componentDecorator) {
      // Continue searching if not found
      ts.forEachChild(node, visitNode);
    }
  }

  visitNode(sourceFile);
  return componentDecorator;
}

/**
 * Gets the value of a specific property (like 'styles' or 'styleUrls') from the decorator.
 */
function getDecoratorPropertyValue(
  decorator: ts.ObjectLiteralExpression,
  propertyName: string,
): string | (string | null)[] | undefined {
  const property = decorator.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propertyName,
  );

  if (property) {
    const initializer = property.initializer;
    // Handle string literal
    if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
      return initializer.text;
    }
    // Handle array literal
    if (ts.isArrayLiteralExpression(initializer)) {
      return initializer.elements.map((element) => {
        if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) {
          return element.text;
        }
        // Non-literal entry (e.g. a referenced constant): can't resolve statically.
        return null;
      });
    }
  }
  return undefined;
}

/**
 * Finds the node of a specific property within the decorator.
 */
function getDecoratorPropertyNode(
  decorator: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | null {
  const property = decorator.properties.find(
    (
      prop, // Type guard added below
    ): prop is ts.PropertyAssignment =>
      // Type guard
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propertyName,
  );
  return property || null; // If find doesn't find it, it returns undefined, which becomes null with ||
}

/**
 * Derives the leading indentation (spaces/tabs) of the line where `node` starts,
 * so inserted properties match the decorator's existing indentation instead of a
 * hardcoded 2 spaces. Falls back to two spaces.
 */
function getIndent(source: string, node: ts.Node): string {
  const start = node.getStart();
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const match = source.substring(lineStart, start).match(/^[ \t]*/);
  return match ? match[0] : '  ';
}

/**
 * How to behave when the destination file (.html/.scss) already exists with
 * content DIFFERENT from the inline source we are about to externalize.
 *   - skip      : leave the inline source intact and warn (default, no data loss)
 *   - overwrite : replace the destination file with the inline content
 *   - suffix    : write to a new, non-colliding file (e.g. foo.component.1.html)
 */
type OnConflict = 'skip' | 'overwrite' | 'suffix';

interface ConflictResolution {
  /** What to do with the destination file. */
  action: 'create' | 'overwrite' | 'reuse' | 'skip';
  /** Final file name to reference from the decorator (may be suffixed). */
  fileName: string;
}

/**
 * Decides what to do with a single destination file given the conflict policy.
 * Centralizes the data-loss guard: a migration must never silently drop the
 * inline source nor clobber an unrelated existing file unless explicitly asked.
 */
function resolveConflict(
  tree: Tree,
  context: SchematicContext,
  componentDir: string,
  fileName: string,
  content: string,
  onConflict: OnConflict,
  componentPath: string,
  kind: 'template' | 'styles',
): ConflictResolution {
  const fullPath = normalize(join(componentDir, fileName));

  if (!tree.exists(fullPath)) {
    return { action: 'create', fileName };
  }

  const existingBuffer = tree.read(fullPath);
  const existing = existingBuffer ? existingBuffer.toString('utf-8') : '';
  if (existing === content) {
    // Same content already on disk: just repoint, nothing to write.
    return { action: 'reuse', fileName };
  }

  // Conflict: destination exists with DIFFERENT content.
  if (onConflict === 'overwrite') {
    context.logger.warn(
      `  ⚠️ Overwriting ${fileName} for ${componentPath} (onConflict=overwrite).`,
    );
    return { action: 'overwrite', fileName };
  }

  if (onConflict === 'suffix') {
    const dot = fileName.lastIndexOf('.');
    const stem = dot === -1 ? fileName : fileName.substring(0, dot);
    const ext = dot === -1 ? '' : fileName.substring(dot);
    let i = 1;
    let candidate = `${stem}.${i}${ext}`;
    while (tree.exists(normalize(join(componentDir, candidate)))) {
      i++;
      candidate = `${stem}.${i}${ext}`;
    }
    context.logger.warn(
      `  ⚠️ ${fileName} already exists for ${componentPath}; writing ${kind} to ${candidate} instead (onConflict=suffix).`,
    );
    return { action: 'create', fileName: candidate };
  }

  // Default: skip. Leave the inline source intact and warn.
  context.logger.warn(
    `  ⚠️ Skipping ${kind} migration for ${componentPath}: ${fileName} already exists with different content. Inline ${kind} left intact to avoid data loss (onConflict=skip).`,
  );
  return { action: 'skip', fileName };
}

// --- Main Schematic Rule ---

export interface MigrarTemplatesOptions {
  /** Conflict policy when a destination file already exists (default 'skip'). */
  onConflict?: OnConflict;
  /** Directory to scan for components, relative to the project root (default 'src'). */
  path?: string;
}

export function migrarTemplates(options: MigrarTemplatesOptions = {}): Rule {
  const onConflict: OnConflict = options.onConflict ?? 'skip';
  // Forward-slash, leading-slash path for the in-memory Tree (no OS separators).
  const searchPath = '/' + (options.path ?? 'src').replace(/^\/+|\/+$/g, '');

  return (tree: Tree, context: SchematicContext): Tree => {
    context.logger.info(
      `🚀 Starting search for components with inline templates and styles in ${searchPath} (onConflict=${onConflict})...`,
    );

    try {
      tree.getDir(searchPath).visit((filePath) => {
        try {
          if (!filePath.endsWith('.component.ts')) {
            context.logger.debug(`  ➡️ Skipping (not a .component.ts file)`);
            return;
          }

          const fileBuffer = tree.read(filePath);
          if (!fileBuffer) {
            context.logger.warn(`  ⚠️ Could not read file: ${filePath}`);
            return;
          }

          const content = fileBuffer.toString('utf-8');
          const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

          const componentDecorator = findComponentDecorator(sourceFile);
          if (!componentDecorator) {
            context.logger.debug(`  ❌ @Component decorator not found or non-standard. Skipping.`);
            return;
          }

          // Tracks whether the template migration actually rewrote the .ts. Only
          // then are the original offsets stale and a re-parse for the styles
          // pass required; otherwise we reuse the source we already parsed.
          let templateMutated = false;

          // Handle template migration
          const hasTemplateUrl = componentDecorator.properties.some(
            (prop) =>
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === 'templateUrl',
          );

          if (!hasTemplateUrl) {
            const templateContent = getDecoratorPropertyValue(componentDecorator, 'template');
            // Only a static string template can be externalized. An array shape
            // is never valid for `template`, and `typeof` narrows away the cast.
            if (typeof templateContent === 'string' && templateContent.trim() !== '') {
              const componentDir = dirname(filePath);
              const componentBaseName = basename(filePath, '.ts');
              const htmlFileName = `${componentBaseName}.html`;

              // Resolve the destination against the conflict policy BEFORE
              // mutating the .ts, so we never drop the inline template unless
              // it is safe (or the user explicitly asked to overwrite/suffix).
              const resolution = resolveConflict(
                tree,
                context,
                componentDir,
                htmlFileName,
                templateContent,
                onConflict,
                filePath,
                'template',
              );
              const safeToMigrateTemplate = resolution.action !== 'skip';
              const relativeHtmlPath = `./${resolution.fileName}`;
              const targetHtmlPath = normalize(join(componentDir, resolution.fileName));
              if (resolution.action === 'create') {
                tree.create(targetHtmlPath, templateContent);
              } else if (resolution.action === 'overwrite') {
                tree.overwrite(targetHtmlPath, templateContent);
              }
              // 'reuse': destination already holds the right content; 'skip': handled below.

              const templatePropertyNode = getDecoratorPropertyNode(componentDecorator, 'template');
              if (safeToMigrateTemplate && templatePropertyNode) {
                const recorder = tree.beginUpdate(filePath);
                const fileLength = content.length;

                // If the property is the first one in the decorator, getFullStart
                // points right after '{' and there is no leading comma. A leading
                // comma in the inserted text would produce '@Component({, ... })'.
                const isFirstProperty = componentDecorator.properties[0] === templatePropertyNode;

                // Calculate safe removal range
                let removalStart = Math.max(0, templatePropertyNode.getFullStart());
                const removalEnd = Math.min(fileLength, templatePropertyNode.getEnd());

                // Check for comma before (only relevant when not the first property)
                if (!isFirstProperty) {
                  const textBeforeNode = content.substring(0, removalStart);
                  const commaMatchBefore = textBeforeNode.match(/,\s*$/);

                  if (commaMatchBefore) {
                    removalStart = Math.max(0, removalStart - commaMatchBefore[0].length);
                  }
                }

                // Ensure we're not trying to remove beyond file bounds
                if (removalStart < fileLength && removalEnd <= fileLength) {
                  recorder.remove(removalStart, removalEnd - removalStart);
                  const indent = getIndent(content, templatePropertyNode);
                  const textToInsert = isFirstProperty
                    ? `\n${indent}templateUrl: '${relativeHtmlPath}'`
                    : `,\n${indent}templateUrl: '${relativeHtmlPath}'`;
                  recorder.insertLeft(removalStart, textToInsert);
                  tree.commitUpdate(recorder);
                  templateMutated = true;
                } else {
                  context.logger.warn(
                    `  ⚠️ Skipping template update for ${filePath}: Invalid removal range`,
                  );
                }
              }
            }
          }

          // Handle styles migration.
          // The styles pass needs offsets valid against the file's *current*
          // content. The template migration above only rewrites the .ts when it
          // commits an update; if it did, re-read and re-parse so the styles
          // removal range is correct. If it did NOT mutate the file, the source
          // we already parsed is still accurate, so we reuse it and skip a second
          // read + parse on the hot path.
          let stylesContentSource: string;
          let stylesComponentDecorator: ts.ObjectLiteralExpression | null;
          if (templateMutated) {
            const stylesFileBuffer = tree.read(filePath);
            if (!stylesFileBuffer) {
              context.logger.warn(`  ⚠️ Could not re-read file for styles migration: ${filePath}`);
              return;
            }
            stylesContentSource = stylesFileBuffer.toString('utf-8');
            const stylesSourceFile = ts.createSourceFile(
              filePath,
              stylesContentSource,
              ts.ScriptTarget.Latest,
              true,
            );
            stylesComponentDecorator = findComponentDecorator(stylesSourceFile);
          } else {
            stylesContentSource = content;
            stylesComponentDecorator = componentDecorator;
          }
          if (!stylesComponentDecorator) {
            return;
          }

          const hasStyleUrls = stylesComponentDecorator.properties.some(
            (prop) =>
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === 'styleUrls',
          );

          if (!hasStyleUrls) {
            const stylesContent = getDecoratorPropertyValue(stylesComponentDecorator, 'styles');
            if (stylesContent !== undefined) {
              const componentDir = dirname(filePath);
              const componentBaseName = basename(filePath, '.ts');
              const stylesPropertyNode = getDecoratorPropertyNode(
                stylesComponentDecorator,
                'styles',
              );

              // Resolve each destination .scss against the conflict policy BEFORE
              // mutating anything. In 'skip' mode any conflict aborts the whole
              // styles migration (inline left intact); otherwise each file is
              // created / overwritten / suffixed per the policy.
              const styleValues = Array.isArray(stylesContent) ? stylesContent : [stylesContent];

              // Guard (empty-styles): `styles: []` (or a now-empty array) has
              // nothing to externalize. Emitting `styleUrls: []` would be churn
              // with no .scss behind it, so leave the decorator untouched.
              const isEmptyStyles = styleValues.length === 0;
              if (isEmptyStyles) {
                context.logger.warn(
                  `  ⚠️ Skipping styles migration for ${filePath}: the inline "styles" is empty; nothing to externalize.`,
                );
              }

              // Guard (array-styles-no-string): a non-literal entry (e.g.
              // styles: [BASE_STYLES]) can't be resolved statically. Emitting an
              // empty .scss would silently drop the real style, so treat it as a
              // skip and leave the inline styles intact.
              const hasNonLiteral = styleValues.some((s) => s === null);
              if (hasNonLiteral) {
                context.logger.warn(
                  `  ⚠️ Skipping styles migration for ${filePath}: a styles entry is not a static string literal (e.g. a referenced constant) and cannot be externalized.`,
                );
              }
              // After the guard above every remaining entry is a string; the
              // type-guarded filter narrows the array without a blind `as` cast.
              const literalStyles = styleValues.filter((s): s is string => s !== null);
              const styleResolutions =
                isEmptyStyles || hasNonLiteral
                  ? []
                  : literalStyles.map((style, index) => {
                      const scssFileName =
                        index === 0
                          ? `${componentBaseName}.scss`
                          : `${componentBaseName}-${index + 1}.scss`;
                      return {
                        style,
                        resolution: resolveConflict(
                          tree,
                          context,
                          componentDir,
                          scssFileName,
                          style,
                          onConflict,
                          filePath,
                          'styles',
                        ),
                      };
                    });
              const stylesSkip =
                isEmptyStyles ||
                hasNonLiteral ||
                styleResolutions.some((r) => r.resolution.action === 'skip');

              if (stylesSkip) {
                // Per-element warnings already emitted by resolveConflict; leave inline intact.
              } else if (stylesPropertyNode) {
                const recorder = tree.beginUpdate(filePath);
                const fileLength = stylesContentSource.length;

                // If the property is the first one in the decorator, getFullStart
                // points right after '{' and there is no leading comma. A leading
                // comma in the inserted text would produce '@Component({, ... })'.
                const isFirstProperty =
                  stylesComponentDecorator.properties[0] === stylesPropertyNode;

                // Calculate safe removal range
                let removalStart = Math.max(0, stylesPropertyNode.getFullStart());
                const removalEnd = Math.min(fileLength, stylesPropertyNode.getEnd());

                // Check for comma before (only relevant when not the first property)
                if (!isFirstProperty) {
                  const textBeforeNode = stylesContentSource.substring(0, removalStart);
                  const commaMatchBefore = textBeforeNode.match(/,\s*$/);

                  if (commaMatchBefore) {
                    removalStart = Math.max(0, removalStart - commaMatchBefore[0].length);
                  }
                }

                // Ensure we're not trying to remove beyond file bounds
                if (removalStart < fileLength && removalEnd <= fileLength) {
                  recorder.remove(removalStart, removalEnd - removalStart);

                  const indent = getIndent(stylesContentSource, stylesPropertyNode);
                  const connector = isFirstProperty ? `\n${indent}` : `,\n${indent}`;
                  const styleUrls = styleResolutions.map(({ style, resolution }) => {
                    const target = normalize(join(componentDir, resolution.fileName));
                    if (resolution.action === 'create') {
                      tree.create(target, style);
                    } else if (resolution.action === 'overwrite') {
                      tree.overwrite(target, style);
                    }
                    // 'reuse': destination already holds the right content.
                    return `./${resolution.fileName}`;
                  });
                  const textToInsert = `${connector}styleUrls: [${styleUrls.map((url) => `'${url}'`).join(', ')}]`;
                  recorder.insertLeft(removalStart, textToInsert);

                  tree.commitUpdate(recorder);
                } else {
                  context.logger.warn(
                    `  ⚠️ Skipping styles update for ${filePath}: Invalid removal range`,
                  );
                }
              }
            }
          }
        } catch (error) {
          context.logger.error(`💥 Error processing file ${filePath}:`);
          if (error instanceof Error) {
            context.logger.error(`  Message: ${error.message}`);
            if (error.stack) {
              context.logger.error(`  Stack: ${error.stack}`);
            }
          } else {
            context.logger.error(`  Error: ${String(error)}`);
          }
        }
      });
    } catch (error) {
      context.logger.fatal(`❌ Fatal error starting file traversal:`);
      if (error instanceof Error) {
        context.logger.fatal(`  Message: ${error.message}`);
        if (error.stack) {
          context.logger.fatal(`  Stack: ${error.stack}`);
        }
      } else {
        context.logger.fatal(`  Error: ${String(error)}`);
      }
      throw error;
    }

    context.logger.info('\n🏁 Inline template and styles migration completed.');
    return tree;
  };
}
