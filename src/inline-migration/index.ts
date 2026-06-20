import { Rule, SchematicContext, Tree } from "@angular-devkit/schematics";
import { dirname, join, basename, normalize } from "path";
import * as ts from "typescript";

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
            if (ts.isIdentifier(expression.expression) && expression.expression.text === "Component") {
              if (expression.arguments.length > 0 && ts.isObjectLiteralExpression(expression.arguments[0])) {
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
function getDecoratorPropertyValue(decorator: ts.ObjectLiteralExpression, propertyName: string): string | string[] | undefined {
  const property = decorator.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === propertyName
  );

  if (property) {
    const initializer = property.initializer;
    // Handle string literal
    if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
      return initializer.text;
    }
    // Handle array literal
    if (ts.isArrayLiteralExpression(initializer)) {
      return initializer.elements.map(element => {
        if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) {
          return element.text;
        }
        return '';
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
  propertyName: string
): ts.PropertyAssignment | null {
  const property = decorator.properties.find(
    (
      prop // Type guard added below
    ): prop is ts.PropertyAssignment => // Type guard
      ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === propertyName
  );
  return property || null; // If find doesn't find it, it returns undefined, which becomes null with ||
}

/**
 * Creates a SCSS file with the given content and returns the relative path.
 */
function createScssFile(
  tree: Tree,
  componentDir: string,
  componentBaseName: string,
  content: string,
  index: number = 0
): string {
  const scssFileName = index === 0 
    ? `${componentBaseName}.scss` 
    : `${componentBaseName}-${index + 1}.scss`;
  const scssFilePath = normalize(join(componentDir, scssFileName));
  const relativeScssPath = `./${scssFileName}`;

  if (!tree.exists(scssFilePath)) {
    tree.create(scssFilePath, content);
  }

  return relativeScssPath;
}

// --- Main Schematic Rule ---

export function migrarTemplates(): Rule {
  return (tree: Tree, context: SchematicContext): Tree => {
    context.logger.info("🚀 Starting search for components with inline templates and styles...");

    try {
      tree.getDir("/src").visit((filePath) => {
        try {
          if (!filePath.endsWith(".component.ts")) {
            context.logger.debug(`  ➡️ Skipping (not a .component.ts file)`);
            return;
          }

          const fileBuffer = tree.read(filePath);
          if (!fileBuffer) {
            context.logger.warn(`  ⚠️ Could not read file: ${filePath}`);
            return;
          }

          const content = fileBuffer.toString("utf-8");
          const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
          );

          const componentDecorator = findComponentDecorator(sourceFile);
          if (!componentDecorator) {
            context.logger.debug(`  ❌ @Component decorator not found or non-standard. Skipping.`);
            return;
          }

          // Handle template migration
          const hasTemplateUrl = componentDecorator.properties.some(
            (prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "templateUrl"
          );

          if (!hasTemplateUrl) {
            const templateContent = getDecoratorPropertyValue(componentDecorator, "template");
            if (templateContent !== undefined) {
              const componentDir = dirname(filePath);
              const componentBaseName = basename(filePath, ".ts");
              const htmlFileName = `${componentBaseName}.html`;
              const htmlFilePath = normalize(join(componentDir, htmlFileName));
              const relativeHtmlPath = `./${htmlFileName}`;

              // Data-loss guard: if the destination already exists with
              // DIFFERENT content, migrating would delete the inline template
              // while repointing the component at unrelated content. Skip the
              // whole migration for this component and leave the .ts intact.
              let safeToMigrateTemplate = true;
              if (tree.exists(htmlFilePath)) {
                const existingBuffer = tree.read(htmlFilePath);
                const existingHtml = existingBuffer ? existingBuffer.toString("utf-8") : "";
                if (existingHtml !== (templateContent as string)) {
                  context.logger.warn(
                    `  ⚠️ Skipping template migration for ${filePath}: ${htmlFileName} already exists with different content. Inline template left intact to avoid data loss.`
                  );
                  safeToMigrateTemplate = false;
                }
              } else {
                tree.create(htmlFilePath, templateContent as string);
              }

              const templatePropertyNode = getDecoratorPropertyNode(componentDecorator, "template");
              if (safeToMigrateTemplate && templatePropertyNode) {
                const recorder = tree.beginUpdate(filePath);
                const fileLength = content.length;

                // If the property is the first one in the decorator, getFullStart
                // points right after '{' and there is no leading comma. A leading
                // comma in the inserted text would produce '@Component({, ... })'.
                const isFirstProperty = componentDecorator.properties[0] === templatePropertyNode;

                // Calculate safe removal range
                let removalStart = Math.max(0, templatePropertyNode.getFullStart());
                let removalEnd = Math.min(fileLength, templatePropertyNode.getEnd());

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
                  const textToInsert = isFirstProperty
                    ? `\n  templateUrl: '${relativeHtmlPath}'`
                    : `,\n  templateUrl: '${relativeHtmlPath}'`;
                  recorder.insertLeft(removalStart, textToInsert);
                  tree.commitUpdate(recorder);
                } else {
                  context.logger.warn(`  ⚠️ Skipping template update for ${filePath}: Invalid removal range`);
                }
              }
            }
          }

          // Handle styles migration.
          // Re-read and re-parse the file: the template migration above may have
          // committed changes that shifted the file length, leaving any offsets
          // taken from the original sourceFile stale. Working from the current
          // content guarantees the styles removal range is correct.
          const stylesFileBuffer = tree.read(filePath);
          if (!stylesFileBuffer) {
            context.logger.warn(`  ⚠️ Could not re-read file for styles migration: ${filePath}`);
            return;
          }
          const stylesContentSource = stylesFileBuffer.toString("utf-8");
          const stylesSourceFile = ts.createSourceFile(
            filePath,
            stylesContentSource,
            ts.ScriptTarget.Latest,
            true
          );
          const stylesComponentDecorator = findComponentDecorator(stylesSourceFile);
          if (!stylesComponentDecorator) {
            return;
          }

          const hasStyleUrls = stylesComponentDecorator.properties.some(
            (prop) => ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "styleUrls"
          );

          if (!hasStyleUrls) {
            const stylesContent = getDecoratorPropertyValue(stylesComponentDecorator, "styles");
            if (stylesContent !== undefined) {
              const componentDir = dirname(filePath);
              const componentBaseName = basename(filePath, ".ts");
              const stylesPropertyNode = getDecoratorPropertyNode(stylesComponentDecorator, "styles");

              // Data-loss guard: if any destination .scss already exists with
              // DIFFERENT content, migrating would delete the inline styles
              // while repointing the component at unrelated content. Detect the
              // conflict before mutating anything, mirroring createScssFile's
              // naming, and skip the migration for this component if found.
              const styleValues = Array.isArray(stylesContent) ? stylesContent : [stylesContent];
              const styleConflict = styleValues.some((style, index) => {
                const scssFileName = index === 0
                  ? `${componentBaseName}.scss`
                  : `${componentBaseName}-${index + 1}.scss`;
                const scssFilePath = normalize(join(componentDir, scssFileName));
                if (!tree.exists(scssFilePath)) {
                  return false;
                }
                const existingBuffer = tree.read(scssFilePath);
                const existingScss = existingBuffer ? existingBuffer.toString("utf-8") : "";
                return existingScss !== style;
              });

              if (styleConflict) {
                context.logger.warn(
                  `  ⚠️ Skipping styles migration for ${filePath}: a destination .scss already exists with different content. Inline styles left intact to avoid data loss.`
                );
              } else if (stylesPropertyNode) {
                const recorder = tree.beginUpdate(filePath);
                const fileLength = stylesContentSource.length;

                // If the property is the first one in the decorator, getFullStart
                // points right after '{' and there is no leading comma. A leading
                // comma in the inserted text would produce '@Component({, ... })'.
                const isFirstProperty = stylesComponentDecorator.properties[0] === stylesPropertyNode;

                // Calculate safe removal range
                let removalStart = Math.max(0, stylesPropertyNode.getFullStart());
                let removalEnd = Math.min(fileLength, stylesPropertyNode.getEnd());

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

                  const connector = isFirstProperty ? '\n  ' : ',\n  ';
                  if (Array.isArray(stylesContent)) {
                    const styleUrls = stylesContent.map((style, index) =>
                      createScssFile(tree, componentDir, componentBaseName, style, index)
                    );
                    const textToInsert = `${connector}styleUrls: [${styleUrls.map(url => `'${url}'`).join(', ')}]`;
                    recorder.insertLeft(removalStart, textToInsert);
                  } else {
                    const scssPath = createScssFile(tree, componentDir, componentBaseName, stylesContent);
                    const textToInsert = `${connector}styleUrls: ['${scssPath}']`;
                    recorder.insertLeft(removalStart, textToInsert);
                  }

                  tree.commitUpdate(recorder);
                } else {
                  context.logger.warn(`  ⚠️ Skipping styles update for ${filePath}: Invalid removal range`);
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

    context.logger.info("\n🏁 Inline template and styles migration completed.");
    return tree;
  };
}
