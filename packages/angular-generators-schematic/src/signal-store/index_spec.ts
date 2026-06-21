import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { Tree, SchematicContext } from '@angular-devkit/schematics';
import { join } from 'path';
import * as ts from 'typescript';
import { signalStore } from './index';

const collectionPath = join(__dirname, '..', 'collection.json');

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
    const tree = await run({ name: 'product', entity: 'Product' });
    const out = tree.readContent('/src/app/product.store.ts');

    expect(out).toContain('items: Product[];');
    expect(out).toContain('addItem(item: Product)');
  });

  it('defaults the entity to unknown when omitted', async () => {
    const tree = await run({ name: 'cart' });
    const out = tree.readContent('/src/app/cart.store.ts');

    expect(out).toContain('items: unknown[];');
  });

  it('emits a store file that parses without syntax errors', async () => {
    const tree = await run({ name: 'product', entity: 'Product' });

    expect(parseErrorCount(tree.readContent('/src/app/product.store.ts'))).toBe(0);
  });

  it('accepts a generic entity type', async () => {
    const tree = await run({ name: 'cart', entity: 'Map<string, Product>' });
    const out = tree.readContent('/src/app/cart.store.ts');

    expect(out).toContain('Map<string, Product>');
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

  it('generates a matching spec file for the store', async () => {
    const tree = await run({ name: 'cart' });

    expect(tree.files).toContain('/src/app/cart.store.spec.ts');
    expect(tree.readContent('/src/app/cart.store.spec.ts')).toContain("describe('CartStore'");
  });
});
