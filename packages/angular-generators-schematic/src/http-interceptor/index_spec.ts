import { SchematicTestRunner, type UnitTestTree } from '@angular-devkit/schematics/testing';
import { join } from 'path';
import * as rxjs from 'rxjs';
import { defer, firstValueFrom, type Observable, throwError } from 'rxjs';
import * as ts from 'typescript';
import { runInNewContext } from 'vm';

const collectionPath = join(__dirname, '..', 'collection.json');

/** The two members of `HttpRequest` the emitted interceptor actually reads. */
interface FakeRequest {
  method: string;
  urlWithParams: string;
}
type InterceptorFn = (
  req: FakeRequest,
  next: (req: FakeRequest) => Observable<unknown>,
) => Observable<unknown>;

/**
 * Compiles the emitted interceptor and RUNS it, so retry behaviour is asserted
 * on the artifact the consumer receives instead of on a substring. The
 * `@angular/common/http` imports are type-only and disappear in the transpile,
 * which is why no Angular runtime is needed here.
 */
function loadInterceptor(source: string, exportName: string): InterceptorFn {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const moduleExports: Record<string, unknown> = {};
  const requireShim = (id: string): unknown => {
    if (id === 'rxjs') {
      return rxjs;
    }
    throw new Error(`The generated interceptor should not require ${id} at runtime.`);
  };
  runInNewContext(js, { require: requireShim, exports: moduleExports, console });

  return moduleExports[exportName] as InterceptorFn;
}

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

  describe('the emitted interceptor, executed', () => {
    beforeEach(() => {
      // The interceptor logs the failure it re-throws; keep the suite output clean.
      spyOn(console, 'error');
    });

    async function requestsSent(method: string, retries: number): Promise<number> {
      const tree = await run({ name: 'auth', retries });
      const interceptor = loadInterceptor(
        tree.readContent('/src/app/auth.interceptor.ts'),
        'authInterceptor',
      );

      // `next(req)` is called once and returns a COLD observable: like a real
      // HttpClient request, the work happens per subscription, so a retry is a
      // re-subscription. Counting subscriptions is counting requests sent.
      let sent = 0;
      const next = (): Observable<unknown> =>
        defer(() => {
          sent++;
          return throwError(() => ({ status: 500, message: 'boom' }));
        });

      await expectAsync(
        firstValueFrom(interceptor({ method, urlWithParams: '/orders' }, next)),
      ).toBeRejected();
      return sent;
    }

    it('emits a failed POST exactly once (no duplicated side effects)', async () => {
      expect(await requestsSent('POST', 2)).toBe(1);
    });

    it('still retries a failed GET', async () => {
      expect(await requestsSent('GET', 1)).toBe(2);
    });
  });

  it('backs off with jitter, not in lockstep', async () => {
    const tree = await run({ name: 'auth' });
    const out = tree.readContent('/src/app/auth.interceptor.ts');

    expect(out).toContain('Math.random()');
  });

  it('classifies network failures by status === 0 (fetch-compatible, not ErrorEvent)', async () => {
    const tree = await run({ name: 'auth' });
    const out = tree.readContent('/src/app/auth.interceptor.ts');

    expect(out).toContain('error.status === 0');
    expect(out).not.toContain('instanceof ErrorEvent');
  });
});
