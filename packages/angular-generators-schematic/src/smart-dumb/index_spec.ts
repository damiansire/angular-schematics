import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { join } from 'path';
import * as ts from 'typescript';

const collectionPath = join(__dirname, '..', 'collection.json');

async function run(options: Record<string, unknown>): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner('schematics', collectionPath);
  return runner.runSchematic('smart-dumb', options);
}

/** Number of syntactic parse errors in a TS source (0 = it compiles cleanly). */
function parseErrorCount(source: string): number {
  const sourceFile = ts.createSourceFile('check.ts', source, ts.ScriptTarget.Latest, true);
  return (sourceFile as unknown as { parseDiagnostics: ReadonlyArray<unknown> }).parseDiagnostics
    .length;
}

describe('smart-dumb schematic', () => {
  it('generates both the dumb and the container components in a dedicated folder', async () => {
    const tree = await run({ name: 'user-list' });

    expect(tree.files).toContain('/src/app/user-list/user-list.component.ts');
    expect(tree.files).toContain('/src/app/user-list/user-list.container.component.ts');
  });

  it('the presentational component is standalone, OnPush and uses inputs/outputs', async () => {
    const tree = await run({ name: 'user-list' });
    const out = tree.readContent('/src/app/user-list/user-list.component.ts');

    expect(out).toContain('export class UserListComponent');
    expect(out).toContain('standalone: true');
    expect(out).toContain('ChangeDetectionStrategy.OnPush');
    expect(out).toContain('readonly items = input');
    expect(out).toContain('readonly selected = output');
    expect(out).toContain("selector: 'app-user-list'");
  });

  it('the container imports and renders the presentational component, wiring its output', async () => {
    const tree = await run({ name: 'user-list' });
    const out = tree.readContent('/src/app/user-list/user-list.container.component.ts');

    expect(out).toContain('export class UserListContainerComponent');
    expect(out).toContain("import { UserListComponent } from './user-list.component';");
    expect(out).toContain('imports: [UserListComponent]');
    expect(out).toContain('(selected)="onSelected($event)"');
    expect(out).toContain("selector: 'app-user-list-container'");
  });

  it('honors a custom selector prefix', async () => {
    const tree = await run({ name: 'user-list', prefix: 'ui' });
    const out = tree.readContent('/src/app/user-list/user-list.component.ts');

    expect(out).toContain("selector: 'ui-user-list'");
  });

  it('honors a custom path', async () => {
    const tree = await run({ name: 'user-list', path: 'src/app/features' });

    expect(tree.files).toContain('/src/app/features/user-list/user-list.component.ts');
  });

  it('emits both components parsing without syntax errors', async () => {
    const tree = await run({ name: 'user-list' });

    expect(parseErrorCount(tree.readContent('/src/app/user-list/user-list.component.ts'))).toBe(0);
    expect(
      parseErrorCount(tree.readContent('/src/app/user-list/user-list.container.component.ts')),
    ).toBe(0);
  });

  it('renders items as keyboard-accessible buttons, not click-only <li>', async () => {
    const tree = await run({ name: 'user-list' });
    const out = tree.readContent('/src/app/user-list/user-list.component.ts');

    expect(out).toContain('<button type="button" (click)="selected.emit(item)">');
    expect(out).not.toContain('<li (click)=');
  });

  it('provides an @empty branch for the items list', async () => {
    const tree = await run({ name: 'user-list' });
    const out = tree.readContent('/src/app/user-list/user-list.component.ts');

    expect(out).toContain('@empty');
  });
});
