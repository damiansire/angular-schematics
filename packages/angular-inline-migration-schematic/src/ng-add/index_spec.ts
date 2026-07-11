import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { join } from 'path';

const collectionPath = join(__dirname, '..', 'collection.json');

async function run(): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner('schematics', collectionPath);
  return runner.runSchematic('ng-add', {});
}

describe('ng-add schematic', () => {
  it('runs without touching the tree', async () => {
    const tree = await run();

    expect(tree.files.length).toBe(0);
  });

  it('logs a confirmation message pointing at the migration schematic', async () => {
    const runner = new SchematicTestRunner('schematics', collectionPath);
    const messages: string[] = [];
    const logsSub = runner.logger.subscribe((entry) => messages.push(entry.message));

    await runner.runSchematic('ng-add', {});

    expect(messages.some((m) => m.includes('angular-inline-migration-schematic installed'))).toBe(
      true,
    );
    expect(messages.some((m) => m.includes('inline-migration'))).toBe(true);
    logsSub.unsubscribe();
  });
});

// NOTE: this only exercises ng-add via SchematicTestRunner. A real end-to-end
// check (`ng new` + `ng add angular-inline-migration-schematic` from npm) is
// pending publication (see asch-1: the package is not published yet).
