import { SchematicTestRunner, UnitTestTree } from "@angular-devkit/schematics/testing";
import { join } from "path";

const collectionPath = join(__dirname, "..", "collection.json");

async function run(options: Record<string, unknown>): Promise<UnitTestTree> {
  const runner = new SchematicTestRunner("schematics", collectionPath);
  return runner.runSchematic("signal-store", options);
}

describe("signal-store schematic", () => {
  it("generates the store file at the default path with a classified class name", async () => {
    const tree = await run({ name: "cart" });

    const path = "/src/app/cart.store.ts";
    expect(tree.files).toContain(path);
    const out = tree.readContent(path);
    expect(out).toContain("export class CartStore");
    expect(out).toContain("@Injectable({ providedIn: 'root' })");
  });

  it("uses signal/computed and exposes immutable update methods", async () => {
    const tree = await run({ name: "cart" });
    const out = tree.readContent("/src/app/cart.store.ts");

    expect(out).toContain("signal<CartState>(initialState)");
    expect(out).toContain("readonly items = computed(");
    expect(out).toContain("addItem(item: unknown)");
    expect(out).toContain("this.state.update(");
  });

  it("respects the entity option for the state type", async () => {
    const tree = await run({ name: "product", entity: "Product" });
    const out = tree.readContent("/src/app/product.store.ts");

    expect(out).toContain("items: Product[];");
    expect(out).toContain("addItem(item: Product)");
  });

  it("defaults the entity to unknown when omitted", async () => {
    const tree = await run({ name: "cart" });
    const out = tree.readContent("/src/app/cart.store.ts");

    expect(out).toContain("items: unknown[];");
  });

  it("honors a custom path", async () => {
    const tree = await run({ name: "cart", path: "src/app/state" });

    expect(tree.files).toContain("/src/app/state/cart.store.ts");
  });

  it("generates a matching spec file for the store", async () => {
    const tree = await run({ name: "cart" });

    expect(tree.files).toContain("/src/app/cart.store.spec.ts");
    expect(tree.readContent("/src/app/cart.store.spec.ts")).toContain("describe('CartStore'");
  });
});
