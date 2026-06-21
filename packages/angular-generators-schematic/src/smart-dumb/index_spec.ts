import { SchematicTestRunner, UnitTestTree } from "@angular-devkit/schematics/testing";
import { join } from "path";

const collectionPath = join(__dirname, "..", "collection.json");

async function run(options: Record<string, unknown>): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner("schematics", collectionPath);
  return runner.runSchematic("smart-dumb", options);
}

describe("smart-dumb schematic", () => {
  it("generates both the dumb and the container components in a dedicated folder", async () => {
    const tree = await run({ name: "user-list" });

    expect(tree.files).toContain("/src/app/user-list/user-list.component.ts");
    expect(tree.files).toContain("/src/app/user-list/user-list.container.component.ts");
  });

  it("the presentational component is standalone, OnPush and uses inputs/outputs", async () => {
    const tree = await run({ name: "user-list" });
    const out = tree.readContent("/src/app/user-list/user-list.component.ts");

    expect(out).toContain("export class UserListComponent");
    expect(out).toContain("standalone: true");
    expect(out).toContain("ChangeDetectionStrategy.OnPush");
    expect(out).toContain("readonly items = input");
    expect(out).toContain("readonly selected = output");
    expect(out).toContain("selector: 'app-user-list'");
  });

  it("the container imports and renders the presentational component, wiring its output", async () => {
    const tree = await run({ name: "user-list" });
    const out = tree.readContent("/src/app/user-list/user-list.container.component.ts");

    expect(out).toContain("export class UserListContainerComponent");
    expect(out).toContain("import { UserListComponent } from './user-list.component';");
    expect(out).toContain("imports: [UserListComponent]");
    expect(out).toContain("(selected)=\"onSelected($event)\"");
    expect(out).toContain("selector: 'app-user-list-container'");
  });

  it("honors a custom selector prefix", async () => {
    const tree = await run({ name: "user-list", prefix: "ui" });
    const out = tree.readContent("/src/app/user-list/user-list.component.ts");

    expect(out).toContain("selector: 'ui-user-list'");
  });

  it("honors a custom path", async () => {
    const tree = await run({ name: "user-list", path: "src/app/features" });

    expect(tree.files).toContain("/src/app/features/user-list/user-list.component.ts");
  });
});
