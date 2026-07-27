# Schematic: Inline Template and Styles Migration

This Angular schematic automates the process of migrating inline `template` and `styles` defined within `@Component` decorators to external `.html` and `.scss` files, respectively.

## What it Does

The schematic (`angular-inline-migration-schematic:inline-migration`, alias `mt`) performs the following actions in your Angular project:

1.  **Finds Components:** It traverses all `.component.ts` files within the `src/` directory.
2.  **Identifies Inline Templates:** If a component has a `template` property but no `templateUrl`:
    - Extracts the content of the `template`.
    - Creates a new `.html` file (e.g., `my-component.component.html`) in the same directory with that content.
    - Replaces the `template: '...'` property with `templateUrl: './my-component.component.html'` in the `.ts` file.
3.  **Identifies Inline Styles:** If a component has a `styles` property but no `styleUrls`:
    - Extracts the content of `styles`. This can be a single string or an array of strings.
    - For each style string, it creates a new `.scss` file (e.g., `my-component.component.scss`, `my-component.component-2.scss`, etc.) in the same directory with that content.
    - Replaces the `styles: [...]` property with `styleUrls: ['./my-component.component.scss', ...]` in the `.ts` file.
4.  **Comma Handling:** Attempts to automatically adjust commas when replacing properties in the decorator.
5.  **Safety (no silent data loss):** When a destination `.html`/`.scss` already exists with **different** content, the schematic does **not** silently drop the inline source. Its behaviour is controlled by the [`onConflict`](#options) option (default `skip`): it warns and leaves the component untouched. Use `overwrite` or `suffix` to opt into a different policy.

## What it Does NOT Do (deliberate limits)

These are refusals, not gaps: in each case the schematic leaves the file exactly
as it was and warns, because there is no answer it could pick without risking
your source.

- **More than one `@Component` per file.** The destination `.html`/`.scss` name is
  derived from the **file** name, so N components in one file would all collide on
  the same destination. The file is skipped with a warning; split it first.
- **A decorator that already declares `templateUrl`, `styleUrl` or `styleUrls`.**
  It is left alone, including the `styleUrl` (singular) form that
  `ng generate component` emits since Angular 17. Adding `styleUrls` next to
  `styleUrl` is rejected by the Angular compiler, so that combination is never
  produced.
- **Styles that are not static string literals** (e.g. `styles: [BASE_STYLES]`) and
  empty `template`/`styles`: nothing can be externalized without dropping or
  inventing content.
- **`.css` / `.less` destinations.** Externalized styles are always written as
  `.scss`; a workspace using another style extension needs to rename afterwards.
- **Multi-project workspaces.** There is no `project` option: the scope is the
  `path` you pass (default `src`), resolved against the tree root. A `path` that
  does not exist is an **error**, not a silent no-op.

The run is fail-closed: if any file errors mid-migration the schematic throws and
the devkit discards **every** change, so a half-rewritten `.ts` is never flushed.
The final line reports counters (`N migrados, M salteados, K con error`), so
"migrated nothing" and "migrated everything" never look alike.

## Usage in a Project

> **Status: not yet published to npm.** This package is **not** available via
> `npm install` yet. To try it today, use the local-link workflow described in
> [Schematic Development](#schematic-development). The `npm install` steps below
> will work once the package is published under the name
> `angular-inline-migration-schematic`.

To use this schematic in your Angular project (once published):

1.  **Installation (after the package is published on npm):**

    ```bash
    ng add angular-inline-migration-schematic
    ```

    `ng add` is the primary path: the package declares
    `"ng-add": { "save": "devDependencies" }`, so the CLI saves this build-time
    tool where it belongs instead of in the app's runtime dependencies.

2.  **Execution:**
    Navigate to the root of your Angular project and run:

    ```bash
    ng generate angular-inline-migration-schematic:inline-migration
    ```

    Or using the `mt` alias (short form):

    ```bash
    ng g angular-inline-migration-schematic:mt
    ```

    The schematic will analyze your project and apply the necessary migrations. Review the generated changes before committing them.

### Options

| Option       | Type                                | Default | Description                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`       | `string`                            | `src`   | Directory to scan for components, relative to the project root.                                                                                                                                                                                                                                                                              |
| `onConflict` | `'skip' \| 'overwrite' \| 'suffix'` | `skip`  | What to do when the destination `.html`/`.scss` already exists with **different** content. `skip`: leave the inline source intact and warn (no data loss). `overwrite`: replace the destination file with the inline content. `suffix`: write to a new, non-colliding file (e.g. `my-component.component.1.html`) and keep the existing one. |

```bash
# Default (safe): skip components whose destination already exists
ng g angular-inline-migration-schematic:inline-migration

# Replace existing destination files with the inline content
ng g angular-inline-migration-schematic:inline-migration --on-conflict overwrite

# Keep both: write the inline content to a suffixed file
ng g angular-inline-migration-schematic:inline-migration --on-conflict suffix
```

## Schematic Development

If you are modifying or developing this schematic locally, follow these steps to test it in another Angular project:

1.  **Build the Schematic:**
    Inside the root directory of the _schematic's project_ (e.g., `angular-tools`), run the build command (ensure it's configured in your `package.json`):

    ```bash
    npm run build
    ```

    This compiles the TypeScript files to JavaScript (usually into a `dist/` directory or similar).

2.  **Create a Symbolic Link (Link):**
    From the root directory of the _schematic's project_, run:

    ```bash
    npm link
    ```

    This creates a global link on your system to your local schematic package, using the name defined in its `package.json`.

3.  **Use the Link in the Test Project:**

    - Navigate to the root directory of the _Angular project where you want to test_ the schematic.
    - Run the `npm link` command followed by the package name of your schematic (the name in the schematic's `package.json`, i.e., `angular-inline-migration-schematic`):
      ```bash
      npm link angular-inline-migration-schematic
      ```
      This creates a folder in the test project's `node_modules` that points directly to your local schematic source code.

4.  **Run the Local Schematic:**
    Now, inside the test project, you can run the schematic as you normally would:

    ```bash
    ng g angular-inline-migration-schematic:inline-migration
    ```

    Angular will find and execute the linked local version of your schematic.

5.  **Unlink (Optional):**
    When you're finished testing, you can unlink the packages:
    - In the _test project_: `npm unlink angular-inline-migration-schematic` (or `npm uninstall angular-inline-migration-schematic`)
    - In the _schematic's project_: `npm unlink`

This workflow allows you to quickly test changes to your schematic without needing to publish it to npm each time.

### Unit Testing

`npm run test` builds the schematic and then runs the unit tests with
[Jasmine](https://jasmine.github.io/) as the runner and test framework.

The tests are characterization tests written with `SchematicTestRunner` from
`@angular-devkit/schematics/testing` (see `src/inline-migration/index_spec.ts`).
They run the schematic against in-memory components and assert on the resulting
tree, covering: inline template only, inline styles only (string and array
forms), template + styles together, the migrated property appearing first / last /
as the only property in the decorator, and the three `onConflict` policies when a
destination file already exists (`skip` / `overwrite` / `suffix`). Each case also
asserts the rewritten `.ts` still parses without errors, guarding against
decorator corruption (e.g. a stray leading comma).

The spec files are compiled to `dist/` as part of the build, which is why the
Jasmine glob targets `dist/**/*_spec.js` rather than `src/`.

### Publishing

The publishable, self-contained artifact is the `dist/` directory: the build
compiles the TypeScript and copies `package.json`, `README.md`, `LICENSE` and
the schematic collection (`collection.json`) into it. Because `package.json`
declares `"schematics": "./collection.json"`, you must publish from `dist/` —
publishing the repository root would ship a package where that path does not
resolve (there is no `collection.json` at the root; it lives in `src/` and is
only copied to `dist/` by the build).

Versioning and the changelog are managed with
[Changesets](https://github.com/changesets/changesets) from the monorepo root
(see the root README). The verified publish flow, after the version has been
bumped, is to build and then publish the `dist/` directory:

```bash
npm run publish:dist   # = build + npm publish ./packages/.../dist
```

which is equivalent to:

```bash
npm run build
npm publish ./dist
```
