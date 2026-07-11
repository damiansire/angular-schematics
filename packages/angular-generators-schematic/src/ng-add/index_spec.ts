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

  it('logs a confirmation message listing the available generators', async () => {
    const runner = new SchematicTestRunner('schematics', collectionPath);
    const messages: string[] = [];
    const logsSub = runner.logger.subscribe((entry) => messages.push(entry.message));

    await runner.runSchematic('ng-add', {});

    expect(messages.some((m) => m.includes('angular-generators-schematic installed'))).toBe(true);
    expect(messages.some((m) => m.includes('signal-store'))).toBe(true);
    logsSub.unsubscribe();
  });
});

// NOTE: this only exercises ng-add via SchematicTestRunner. A real end-to-end
// check (`ng new` + `ng add angular-generators-schematic` from npm) is
// pending publication (see asch-1: the package is not published yet).
