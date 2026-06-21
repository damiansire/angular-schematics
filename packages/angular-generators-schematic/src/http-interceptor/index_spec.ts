import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { join } from 'path';
import * as ts from 'typescript';

const collectionPath = join(__dirname, '..', 'collection.json');

async function run(options: Record<string, unknown>): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner('schematics', collectionPath);
  return runner.runSchematic('http-interceptor', options);
}

/** Number of syntactic parse errors in a TS source (0 = it compiles cleanly). */
function parseErrorCount(source: string): number {
  const sourceFile = ts.createSourceFile('check.ts', source, ts.ScriptTarget.Latest, true);
  return (sourceFile as unknown as { parseDiagnostics: ReadonlyArray<unknown> }).parseDiagnostics
    .length;
}

describe('http-interceptor schematic', () => {
  it('generates a functional HttpInterceptorFn with a camelized name', async () => {
    const tree = await run({ name: 'auth' });

    const path = '/src/app/auth.interceptor.ts';
    expect(tree.files).toContain(path);
    const out = tree.readContent(path);
    expect(out).toContain('export const authInterceptor: HttpInterceptorFn');
    expect(out).toContain(
      "import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';",
    );
  });

  it('dasherizes multi-word names for the file and camelizes the symbol', async () => {
    const tree = await run({ name: 'errorHandling' });

    expect(tree.files).toContain('/src/app/error-handling.interceptor.ts');
    const out = tree.readContent('/src/app/error-handling.interceptor.ts');
    expect(out).toContain('export const errorHandlingInterceptor: HttpInterceptorFn');
  });

  it('wires retry and error handling with the default retry count', async () => {
    const tree = await run({ name: 'auth' });
    const out = tree.readContent('/src/app/auth.interceptor.ts');

    expect(out).toContain('const MAX_RETRIES = 2;');
    expect(out).toContain('retry({');
    expect(out).toContain('catchError(');
    expect(out).toContain('isTransient(error)');
  });

  it('honors a custom retries value', async () => {
    const tree = await run({ name: 'auth', retries: 5 });
    const out = tree.readContent('/src/app/auth.interceptor.ts');

    expect(out).toContain('const MAX_RETRIES = 5;');
  });

  it('honors a custom path', async () => {
    const tree = await run({ name: 'auth', path: 'src/app/core/http' });

    expect(tree.files).toContain('/src/app/core/http/auth.interceptor.ts');
  });

  it('emits an interceptor that parses without syntax errors', async () => {
    const tree = await run({ name: 'auth' });

    expect(parseErrorCount(tree.readContent('/src/app/auth.interceptor.ts'))).toBe(0);
  });

  it('does not import the unused `inject` symbol (breaks noUnusedLocals)', async () => {
    const tree = await run({ name: 'auth' });
    const out = tree.readContent('/src/app/auth.interceptor.ts');

    expect(out).not.toContain('import { inject }');
  });

  it('classifies network failures by status === 0 (fetch-compatible, not ErrorEvent)', async () => {
    const tree = await run({ name: 'auth' });
    const out = tree.readContent('/src/app/auth.interceptor.ts');

    expect(out).toContain('error.status === 0');
    expect(out).not.toContain('instanceof ErrorEvent');
  });
});
