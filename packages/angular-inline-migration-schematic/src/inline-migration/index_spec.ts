import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { join } from 'path';
import * as ts from 'typescript';

const collectionPath = join(__dirname, '..', 'collection.json');

/**
 * Returns the number of parse errors TypeScript reports for the given source.
 * Used as a characterization guard: a malformed decorator (e.g. a leading
 * comma like `@Component({, ... })`) yields a non-zero count.
 */
function parseErrorCount(source: string): number {
  const sourceFile = ts.createSourceFile('check.ts', source, ts.ScriptTarget.Latest, true);
  return (sourceFile as unknown as { parseDiagnostics: ReadonlyArray<unknown> }).parseDiagnostics
    .length;
}

function componentFile(decoratorBody: string): string {
  return `import { Component } from '@angular/core';

@Component({${decoratorBody}})
export class FooComponent {}
`;
}

async function migrate(
  files: Record<string, string>,
  options: Record<string, unknown> = {},
): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner('inline-migration', collectionPath);
  const tree = Tree.empty();
  for (const [path, content] of Object.entries(files)) {
    tree.create(path, content);
  }
  return runner.runSchematic('inline-migration', options, tree);
}

const COMPONENT = '/src/app/foo.component.ts';

describe('inline-migration schematic', () => {
  it('migrates an inline template to an external .html file', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>hello</p>',
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain('/src/app/foo.component.html');
    expect(result.readContent('/src/app/foo.component.html')).toBe('<p>hello</p>');
    expect(out).toContain("templateUrl: './foo.component.html'");
    expect(out).not.toContain('template:');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('migrates an inline styles string to an external .scss file', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: 'p { color: red; }',
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain('/src/app/foo.component.scss');
    expect(result.readContent('/src/app/foo.component.scss')).toBe('p { color: red; }');
    expect(out).toContain("styleUrls: ['./foo.component.scss']");
    expect(out).not.toContain('styles:');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('migrates an inline styles array into one .scss file per entry', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: ['a { color: red; }', 'b { color: blue; }'],
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain('/src/app/foo.component.scss');
    expect(result.files).toContain('/src/app/foo.component-2.scss');
    expect(result.readContent('/src/app/foo.component.scss')).toBe('a { color: red; }');
    expect(result.readContent('/src/app/foo.component-2.scss')).toBe('b { color: blue; }');
    expect(out).toContain("styleUrls: ['./foo.component.scss', './foo.component-2.scss']");
    expect(parseErrorCount(out)).toBe(0);
  });

  it('migrates template and styles together without corrupting the file', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>hi</p>',
  styles: 'p { margin: 0; }',
`),
    });

    const out = result.readContent(COMPONENT);
    expect(result.files).toContain('/src/app/foo.component.html');
    expect(result.files).toContain('/src/app/foo.component.scss');
    expect(out).toContain("templateUrl: './foo.component.html'");
    expect(out).toContain("styleUrls: ['./foo.component.scss']");
    expect(out).not.toContain('template:');
    expect(out).not.toContain('styles:');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('handles template as the first property of the decorator', async () => {
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

  it('handles styles as the only property of the decorator', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`styles: 'p { color: green; }'`),
    });

    const out = result.readContent(COMPONENT);
    expect(out).toContain("styleUrls: ['./foo.component.scss']");
    expect(parseErrorCount(out)).toBe(0);
  });

  describe('destination file already exists with different content', () => {
    const conflictFiles = () => ({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>new</p>',
`),
      '/src/app/foo.component.html': '<p>existing</p>',
    });

    it('skips the migration by default, leaving the inline template intact (no data loss)', async () => {
      const result = await migrate(conflictFiles());

      // Existing file untouched AND the inline template preserved.
      expect(result.readContent('/src/app/foo.component.html')).toBe('<p>existing</p>');
      const out = result.readContent(COMPONENT);
      expect(out).toContain("template: '<p>new</p>'");
      expect(out).not.toContain('templateUrl');
      expect(parseErrorCount(out)).toBe(0);
    });

    it('overwrites the destination with the inline content when onConflict=overwrite', async () => {
      const result = await migrate(conflictFiles(), { onConflict: 'overwrite' });

      expect(result.readContent('/src/app/foo.component.html')).toBe('<p>new</p>');
      const out = result.readContent(COMPONENT);
      expect(out).toContain("templateUrl: './foo.component.html'");
      expect(out).not.toContain('template:');
      expect(parseErrorCount(out)).toBe(0);
    });

    it('writes to a suffixed file, preserving both, when onConflict=suffix', async () => {
      const result = await migrate(conflictFiles(), { onConflict: 'suffix' });

      // Existing file preserved; inline written to a new, non-colliding file.
      expect(result.readContent('/src/app/foo.component.html')).toBe('<p>existing</p>');
      expect(result.readContent('/src/app/foo.component.1.html')).toBe('<p>new</p>');
      const out = result.readContent(COMPONENT);
      expect(out).toContain("templateUrl: './foo.component.1.html'");
      expect(out).not.toContain('template:');
      expect(parseErrorCount(out)).toBe(0);
    });
  });

  it('leaves a component that already uses templateUrl/styleUrls untouched', async () => {
    const original = componentFile(`
  selector: 'app-foo',
  templateUrl: './foo.component.html',
  styleUrls: ['./foo.component.scss'],
`);
    const result = await migrate({ [COMPONENT]: original });

    expect(result.readContent(COMPONENT)).toBe(original);
  });

  it('scans the directory given by the path option instead of /src', async () => {
    const result = await migrate(
      {
        '/projects/app/foo.component.ts': componentFile(`
  selector: 'app-foo',
  template: '<p>scoped</p>',
`),
      },
      { path: 'projects' },
    );

    expect(result.readContent('/projects/app/foo.component.html')).toBe('<p>scoped</p>');
    expect(result.readContent('/projects/app/foo.component.ts')).toContain(
      "templateUrl: './foo.component.html'",
    );
  });

  it('ignores components outside the default /src path', async () => {
    const result = await migrate({
      '/lib/foo.component.ts': componentFile(`
  selector: 'app-foo',
  template: '<p>x</p>',
`),
    });

    expect(result.files).not.toContain('/lib/foo.component.html');
    expect(result.readContent('/lib/foo.component.ts')).toContain("template: '<p>x</p>'");
  });

  it('skips styles migration when an array entry is not a static string literal', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: [BASE_STYLES],
`),
    });

    const out = result.readContent(COMPONENT);
    // No empty .scss emitted; the real (non-resolvable) style is left inline.
    expect(result.files).not.toContain('/src/app/foo.component.scss');
    expect(out).toContain('styles: [BASE_STYLES]');
    expect(out).not.toContain('styleUrls');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('leaves an empty inline template untouched (no empty .html, no templateUrl)', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '',
`),
    });

    const out = result.readContent(COMPONENT);
    // An empty template has nothing to externalize: don't emit an empty .html
    // nor rewrite the decorator to point at one.
    expect(result.files).not.toContain('/src/app/foo.component.html');
    expect(out).toContain("template: ''");
    expect(out).not.toContain('templateUrl');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('leaves an empty inline styles array untouched (no empty styleUrls)', async () => {
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: [],
`),
    });

    const out = result.readContent(COMPONENT);
    // `styles: []` has nothing to externalize: don't churn it into `styleUrls: []`.
    expect(result.files).not.toContain('/src/app/foo.component.scss');
    expect(out).toContain('styles: []');
    expect(out).not.toContain('styleUrls');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('matches the existing decorator indentation when inserting (not hardcoded 2 spaces)', async () => {
    const source = `import { Component } from '@angular/core';

@Component({
    selector: 'app-foo',
    template: '<p>indent</p>',
})
export class FooComponent {}
`;
    const result = await migrate({ [COMPONENT]: source });

    const out = result.readContent(COMPONENT);
    // The decorator uses 4-space indentation; the inserted templateUrl must too.
    expect(out).toContain("\n    templateUrl: './foo.component.html'");
    expect(out).not.toContain('\n  templateUrl:');
    expect(parseErrorCount(out)).toBe(0);
  });
});
