import { Tree } from "@angular-devkit/schematics";
import { SchematicTestRunner, UnitTestTree } from "@angular-devkit/schematics/testing";
import { join } from "path";
import * as ts from "typescript";

const collectionPath = join(__dirname, "..", "collection.json");

/**
 * Returns the number of parse errors TypeScript reports for the given source.
 * Used as a characterization guard: a malformed decorator (e.g. a leading
 * comma like `@Component({, ... })`) yields a non-zero count.
 */
function parseErrorCount(source: string): number {
  const sourceFile = ts.createSourceFile("check.ts", source, ts.ScriptTarget.Latest, true);
  return (sourceFile as unknown as { parseDiagnostics: ReadonlyArray<unknown> }).parseDiagnostics.length;
}

function componentFile(decoratorBody: string): string {
  return `import { Component } from '@angular/core';

@Component({${decoratorBody}})
export class FooComponent {}
`;
}

async function migrate(files: Record<string, string>): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner("inline-migration", collectionPath);
  const tree = Tree.empty();
  for (const [path, content] of Object.entries(files)) {
    tree.create(path, content);
  }
  return runner.runSchematic("inline-migration", {}, tree);
}

const COMPONENT = "/src/app/foo.component.ts";

describe("inline-migration schematic", () => {
  it("migrates an inline template to an external .html file", async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>hello</p>',
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain("/src/app/foo.component.html");
    expect(result.readContent("/src/app/foo.component.html")).toBe("<p>hello</p>");
    expect(out).toContain("templateUrl: './foo.component.html'");
    expect(out).not.toContain("template:");
    expect(parseErrorCount(out)).toBe(0);
  });

  it("migrates an inline styles string to an external .scss file", async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: 'p { color: red; }',
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain("/src/app/foo.component.scss");
    expect(result.readContent("/src/app/foo.component.scss")).toBe("p { color: red; }");
    expect(out).toContain("styleUrls: ['./foo.component.scss']");
    expect(out).not.toContain("styles:");
    expect(parseErrorCount(out)).toBe(0);
  });

  it("migrates an inline styles array into one .scss file per entry", async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: ['a { color: red; }', 'b { color: blue; }'],
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain("/src/app/foo.component.scss");
    expect(result.files).toContain("/src/app/foo.component-2.scss");
    expect(result.readContent("/src/app/foo.component.scss")).toBe("a { color: red; }");
    expect(result.readContent("/src/app/foo.component-2.scss")).toBe("b { color: blue; }");
    expect(out).toContain("styleUrls: ['./foo.component.scss', './foo.component-2.scss']");
    expect(parseErrorCount(out)).toBe(0);
  });

  it("migrates template and styles together without corrupting the file", async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>hi</p>',
  styles: 'p { margin: 0; }',
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain("/src/app/foo.component.html");
    expect(result.files).toContain("/src/app/foo.component.scss");
    expect(out).toContain("templateUrl: './foo.component.html'");
    expect(out).toContain("styleUrls: ['./foo.component.scss']");
    expect(out).not.toContain("template:");
    expect(out).not.toContain("styles:");
    expect(parseErrorCount(out)).toBe(0);
  });

  it("handles template as the first property of the decorator", async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  template: '<p>first</p>',
  selector: 'app-foo',
`),
    });

    const out = result.readContent(COMPONENT);
    expect(out).toContain("templateUrl: './foo.component.html'");
    // A leading comma would yield `@Component({,` — guard against it.
    expect(parseErrorCount(out)).toBe(0);
  });

  it("handles styles as the only property of the decorator", async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`styles: 'p { color: green; }'`),
    });

    const out = result.readContent(COMPONENT);
    expect(out).toContain("styleUrls: ['./foo.component.scss']");
    expect(parseErrorCount(out)).toBe(0);
  });

  it("does not overwrite a preexisting destination file", async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>new</p>',
`),
      "/src/app/foo.component.html": "<p>existing</p>",
    });

    // The .ts is still rewritten to point at the file, but its content is preserved.
    expect(result.readContent("/src/app/foo.component.html")).toBe("<p>existing</p>");
    expect(result.readContent(COMPONENT)).toContain("templateUrl: './foo.component.html'");
  });

  it("leaves a component that already uses templateUrl/styleUrls untouched", async () => {
    const original = componentFile(`
  selector: 'app-foo',
  templateUrl: './foo.component.html',
  styleUrls: ['./foo.component.scss'],
`);
    const result = await migrate({ [COMPONENT]: original });

    expect(result.readContent(COMPONENT)).toBe(original);
  });
});
