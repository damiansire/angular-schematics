import { SchematicTestRunner, type UnitTestTree } from '@angular-devkit/schematics/testing';
import { type Tree, type SchematicContext } from '@angular-devkit/schematics';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ts from 'typescript';
import { signalStore } from './index';

const collectionPath = join(__dirname, '..', 'collection.json');

/**
 * Minimal ambient declarations for what the emitted code imports. Enough to
 * resolve symbols and types without pulling Angular into this package's
 * dependency tree, which is what allows the emitted code to be type-checked
 * (not just string-matched) inside the unit suite.
 */
const AMBIENT_STUBS = `
declare module '@angular/core' {
  export interface Signal<T> {
    (): T;
  }
  export interface WritableSignal<T> extends Signal<T> {
    set(value: T): void;
    update(updateFn: (value: T) => T): void;
  }
  export function signal<T>(initialValue: T): WritableSignal<T>;
  export function computed<T>(computation: () => T): Signal<T>;
  export function Injectable(options?: { providedIn?: string | null }): any;
}
declare function describe(description: string, specDefinitions: () => void): void;
declare function it(expectation: string, assertion: () => void): void;
declare function beforeEach(action: () => void): void;
declare function expect(actual: unknown): any;
`;

/**
 * Type-checks the emitted files instead of grepping them. `parseErrorCount`
 * only sees SYNTAX, so a type the generated file references but never imports
 * (TS2304 on the consumer's first `ng build`) used to sail through the suite.
 */
function semanticErrors(files: Record<string, string>): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'signal-store-'));
  try {
    const roots: string[] = [];
    const stubPath = join(dir, 'ambient.d.ts');
    writeFileSync(stubPath, AMBIENT_STUBS, 'utf8');
    roots.push(stubPath);
    for (const [name, content] of Object.entries(files)) {
      const filePath = join(dir, name);
      writeFileSync(filePath, content, 'utf8');
      roots.push(filePath);
    }

    const program = ts.createProgram(roots, {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      experimentalDecorators: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    });

    return program
      .getSemanticDiagnostics()
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function run(options: Record<string, unknown>): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner('schematics', collectionPath);
  return runner.runSchematic('signal-store', options);
}

/** Number of syntactic parse errors in a TS source (0 = it compiles cleanly). */
function parseErrorCount(source: string): number {
  const sourceFile = ts.createSourceFile('check.ts', source, ts.ScriptTarget.Latest, true);
  return (sourceFile as unknown as { parseDiagnostics: ReadonlyArray<unknown> }).parseDiagnostics
    .length;
}

describe('signal-store schematic', () => {
  it('generates the store file at the default path with a classified class name', async () => {
    const tree = await run({ name: 'cart' });

    const path = '/src/app/cart.store.ts';
    expect(tree.files).toContain(path);
    const out = tree.readContent(path);
    expect(out).toContain('export class CartStore');
    expect(out).toContain("@Injectable({ providedIn: 'root' })");
  });

  it('uses signal/computed and exposes immutable update methods', async () => {
    const tree = await run({ name: 'cart' });
    const out = tree.readContent('/src/app/cart.store.ts');

    expect(out).toContain('signal<CartState>(initialState)');
    expect(out).toContain('readonly items = computed(');
    expect(out).toContain('addItem(item: unknown)');
    expect(out).toContain('this.state.update(');
  });

  it('respects the entity option for the state type', async () => {
    const tree = await run({
      name: 'product',
      entity: 'Product',
      entityImport: './product.model',
    });
    const out = tree.readContent('/src/app/product.store.ts');

    expect(out).toContain('items: Product[];');
    expect(out).toContain('addItem(item: Product)');
  });

  it('imports the entity type it references, in the store and in the generated spec', async () => {
    const tree = await run({
      name: 'product',
      entity: 'Product',
      entityImport: './product.model',
    });

    expect(tree.readContent('/src/app/product.store.ts')).toContain(
      "import { Product } from './product.model';",
    );
    expect(tree.readContent('/src/app/product.store.spec.ts')).toContain(
      "import { Product } from './product.model';",
    );
  });

  it('refuses a non built-in entity without --entity-import instead of emitting TS2304', async () => {
    await expectAsync(run({ name: 'product', entity: 'Product' })).toBeRejectedWithError(
      /entity-import/,
    );
  });

  it('does not double the array suffix when the entity is already an array type', async () => {
    const tree = await run({
      name: 'cart',
      entity: 'Product[]',
      entityImport: './product.model',
    });
    const out = tree.readContent('/src/app/cart.store.ts');

    expect(out).toContain('items: Product[];');
    expect(out).not.toContain('Product[][]');
  });

  it('rejects an entity carrying a top-level comma (two types where one is expected)', async () => {
    await expectAsync(
      run({ name: 'cart', entity: 'A, B', entityImport: './models' }),
    ).toBeRejectedWithError(/Invalid "entity" type/);
  });

  it('rejects a name that would not survive interpolation into code and paths', async () => {
    await expectAsync(run({ name: "cart'; const x = 1;//" })).toBeRejected();
    await expectAsync(run({ name: '../../../evil' })).toBeRejected();
  });

  it('the rule factory itself rejects an invalid name (defense in depth)', () => {
    // The schema `pattern` only runs through the Angular CLI; a factory called
    // directly (or via another schematic) must refuse on its own.
    for (const name of ["cart'; const x = 1;//", '../../../evil', '', '1cart']) {
      const outerRule = signalStore({ name });

      expect(() =>
        (outerRule as (t: Tree, c: SchematicContext) => unknown)(
          {} as Tree,
          {} as SchematicContext,
        ),
      ).toThrowError(/Invalid "name"/);
    }
  });

  it('defaults the entity to unknown when omitted', async () => {
    const tree = await run({ name: 'cart' });
    const out = tree.readContent('/src/app/cart.store.ts');

    expect(out).toContain('items: unknown[];');
  });

  it('emits a store file that parses without syntax errors', async () => {
    const tree = await run({
      name: 'product',
      entity: 'Product',
      entityImport: './product.model',
    });

    expect(parseErrorCount(tree.readContent('/src/app/product.store.ts'))).toBe(0);
  });

  it('accepts a generic entity type', async () => {
    const tree = await run({
      name: 'cart',
      entity: 'Map<string, Product>',
      entityImport: './product.model',
    });
    const out = tree.readContent('/src/app/cart.store.ts');

    expect(out).toContain('Map<string, Product>');
    expect(out).toContain("import { Product } from './product.model';");
    expect(parseErrorCount(out)).toBe(0);
  });

  it('rejects an entity that is not a valid TypeScript type reference (schema pattern)', async () => {
    await expectAsync(run({ name: 'evil', entity: 'Product; const HACKED = 1' })).toBeRejected();
  });

  it('the rule factory itself rejects an invalid entity (defense in depth)', () => {
    const outerRule = signalStore({ name: 'evil', entity: 'Product; const X = 1' });

    expect(() =>
      (outerRule as (t: Tree, c: SchematicContext) => unknown)({} as Tree, {} as SchematicContext),
    ).toThrowError(/Invalid "entity" type/);
  });

  it('honors a custom path', async () => {
    const tree = await run({ name: 'cart', path: 'src/app/state' });

    expect(tree.files).toContain('/src/app/state/cart.store.ts');
  });

  describe('the emitted code type-checks (not just parses)', () => {
    it('with the default entity', async () => {
      const tree = await run({ name: 'cart' });

      expect(
        semanticErrors({
          'cart.store.ts': tree.readContent('/src/app/cart.store.ts'),
          'cart.store.spec.ts': tree.readContent('/src/app/cart.store.spec.ts'),
        }),
      ).toEqual([]);
    });

    it('with an entity type coming from another module', async () => {
      const tree = await run({
        name: 'product',
        entity: 'Product',
        entityImport: './product.model',
      });

      expect(
        semanticErrors({
          'product.model.ts': 'export interface Product {\n  id: number;\n}\n',
          'product.store.ts': tree.readContent('/src/app/product.store.ts'),
          'product.store.spec.ts': tree.readContent('/src/app/product.store.spec.ts'),
        }),
      ).toEqual([]);
    });

    it('and the gate itself catches a missing import (guard against a vacuous check)', () => {
      const errors = semanticErrors({
        'broken.ts': 'export const items: Product[] = [];\n',
      });

      expect(errors.join(' ')).toContain("Cannot find name 'Product'");
    });
  });

  it('generates a matching spec file for the store', async () => {
    const tree = await run({ name: 'cart' });

    expect(tree.files).toContain('/src/app/cart.store.spec.ts');
    expect(tree.readContent('/src/app/cart.store.spec.ts')).toContain("describe('CartStore'");
  });
});
