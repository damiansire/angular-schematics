import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner, type UnitTestTree } from '@angular-devkit/schematics/testing';
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
  return (await migrateWithLogs(files, options)).tree;
}

/**
 * Same as `migrate`, but also captures everything the schematic logged.
 * Every skip path of this codemod is visible ONLY through a warning: without
 * asserting the message, "nothing to do" and "I silently gave up" are the same
 * green test.
 */
async function migrateWithLogs(
  files: Record<string, string>,
  options: Record<string, unknown> = {},
): Promise<{ tree: UnitTestTree; logs: string[] }> {
  const runner = new SchematicTestRunner('inline-migration', collectionPath);
  const logs: string[] = [];
  runner.logger.subscribe((entry) => logs.push(`${entry.level}: ${entry.message}`));
  const tree = Tree.empty();
  for (const [path, content] of Object.entries(files)) {
    tree.create(path, content);
  }
  const result = await runner.runSchematic('inline-migration', options, tree);
  return { tree: result, logs };
}

/** The single log line matching `pattern`, or '' when none matched. */
function logMatching(logs: string[], pattern: RegExp): string {
  return logs.find((line) => pattern.test(line)) ?? '';
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
    // The scanned path (/src) must exist: an empty scope is an error now, so the
    // fixture carries a real component inside /src and the assertion is that the
    // one OUTSIDE is left alone.
    const result = await migrate({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>inside</p>',
`),
      '/lib/foo.component.ts': componentFile(`
  selector: 'app-bar',
  template: '<p>x</p>',
`),
    });

    expect(result.files).toContain('/src/app/foo.component.html');
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

  describe('more than one @Component in the same file', () => {
    const twoComponents = `import { Component } from '@angular/core';

@Component({
  selector: 'app-foo',
  template: '<p>MAIN A</p>',
})
export class FooComponent {}

@Component({
  selector: 'app-bar',
  template: '<p>HELPER B</p>',
})
export class BarComponent {}
`;

    it('leaves the file untouched and warns instead of rewriting the wrong class', async () => {
      const { tree, logs } = await migrateWithLogs({ [COMPONENT]: twoComponents });

      // Both templates stay inline and no .html is emitted: with one destination
      // name per FILE there is no correct answer for two components.
      expect(tree.readContent(COMPONENT)).toBe(twoComponents);
      expect(tree.files).not.toContain('/src/app/foo.component.html');
      expect(logMatching(logs, /2 @Component/)).toContain('warn:');
    });
  });

  describe('styleUrl (singular, the Angular 17+ default)', () => {
    it('leaves the decorator untouched when styleUrl coexists with inline styles', async () => {
      const original = componentFile(`
  selector: 'app-foo',
  styleUrl: './foo.component.css',
  styles: 'p { color: red; }',
`);
      const { tree, logs } = await migrateWithLogs({ [COMPONENT]: original });

      const out = tree.readContent(COMPONENT);
      // Emitting styleUrls next to styleUrl is rejected by the Angular compiler.
      expect(out).toBe(original);
      expect(out).not.toContain('styleUrls');
      expect(tree.files).not.toContain('/src/app/foo.component.scss');
      expect(logMatching(logs, /already declares styleUrl/)).toContain('warn:');
    });

    it('migrates only the template when styleUrl is present without inline styles', async () => {
      const result = await migrate({
        [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styleUrl: './foo.component.css',
  template: '<p>hi</p>',
`),
      });

      const out = result.readContent(COMPONENT);
      expect(out).toContain("templateUrl: './foo.component.html'");
      expect(out).toContain("styleUrl: './foo.component.css'");
      expect(out).not.toContain('styleUrls');
      expect(parseErrorCount(out)).toBe(0);
    });
  });

  describe('scope and reporting', () => {
    it('fails loudly when the scanned path does not exist (no silent no-op)', async () => {
      await expectAsync(
        migrate(
          {
            [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>hi</p>',
`),
          },
          { path: 'sourse' },
        ),
      ).toBeRejectedWithError(/\/sourse no existe o está vacío/);
    });

    it('closes with a counted summary instead of a fixed "completed" line', async () => {
      const { logs } = await migrateWithLogs({
        [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>hi</p>',
`),
        '/src/app/bar.component.ts': `import { Component } from '@angular/core';

@Component({
  selector: 'app-bar',
  templateUrl: './bar.component.html',
  template: '<p>ignored</p>',
})
export class BarComponent {}
`,
      });

      expect(logMatching(logs, /🏁/)).toContain('1 migrados, 1 salteados, 0 con error');
    });
  });

  describe('fail-closed', () => {
    it('discards every change when a file blows up mid-migration', async () => {
      // Fault injection: the destination .html path is occupied by a DIRECTORY,
      // so tree.create throws after the template pass already mutated the .ts.
      const original = componentFile(`
  selector: 'app-foo',
  template: '<p>hello</p>',
`);

      await expectAsync(
        migrate({
          [COMPONENT]: original,
          '/src/app/foo.component.html/inner.txt': 'x',
        }),
      ).toBeRejectedWithError(/no se escribió ningún cambio/);
    });
  });

  describe('warnings are the only visible signal of a skip', () => {
    const conflict = () => ({
      [COMPONENT]: componentFile(`
  selector: 'app-foo',
  template: '<p>new</p>',
`),
      '/src/app/foo.component.html': '<p>existing</p>',
    });

    it('warns on skip', async () => {
      const { logs } = await migrateWithLogs(conflict());
      expect(logMatching(logs, /Skipping template migration/)).toContain('onConflict=skip');
    });

    it('warns on overwrite', async () => {
      const { logs } = await migrateWithLogs(conflict(), { onConflict: 'overwrite' });
      expect(logMatching(logs, /Overwriting/)).toContain('onConflict=overwrite');
    });

    it('warns on suffix, naming the file it actually wrote', async () => {
      const { logs } = await migrateWithLogs(conflict(), { onConflict: 'suffix' });
      expect(logMatching(logs, /writing template to/)).toContain(
        'foo.component.1.html instead (onConflict=suffix)',
      );
    });

    it('warns when the inline styles array is empty', async () => {
      const { logs } = await migrateWithLogs({
        [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: [],
`),
      });
      expect(logMatching(logs, /"styles" is empty/)).toContain('warn:');
    });

    it('warns when a styles entry is not a static string literal', async () => {
      const { logs } = await migrateWithLogs({
        [COMPONENT]: componentFile(`
  selector: 'app-foo',
  styles: [BASE_STYLES],
`),
      });
      expect(logMatching(logs, /not a static string literal/)).toContain('warn:');
    });
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
