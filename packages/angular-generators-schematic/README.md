# angular-generators-schematic

A collection of practical Angular **generator** schematics for day-to-day work.
All three emit modern, standalone, signals-first code.

| Schematic          | Alias | Generates                                                                                                                                             |
| ------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal-store`     | `ss`  | A signals-based store service (private `WritableSignal` state, `computed` selectors, immutable update methods) plus its spec.                         |
| `http-interceptor` | `hi`  | A functional `HttpInterceptorFn` with centralized error handling and a configurable retry (exponential backoff) for transient 5xx / network failures. |
| `smart-dumb`       | `sd`  | A paired **container** (smart) + **presentational** (dumb) standalone component set, already wired together via inputs/outputs.                       |

> **Status: not yet published to npm.** Use the local `npm link` workflow during
> development (see the sibling package's README for the full link recipe).

## Usage

```bash
# signals store -> src/app/cart.store.ts (CartStore) + spec
# --entity-import is required whenever --entity is not a built-in type:
# without it the generated file would reference Product without importing it.
ng g angular-generators-schematic:signal-store cart --entity Product --entity-import ./product.model

# functional interceptor -> src/app/auth.interceptor.ts (authInterceptor)
ng g angular-generators-schematic:http-interceptor auth --retries 3

# smart/dumb pair -> src/app/user-list/{user-list.component.ts, user-list.container.component.ts}
ng g angular-generators-schematic:smart-dumb user-list --prefix app
```

### Options

#### `signal-store` (alias `ss`)

| Option         | Type     | Default      | Description                                                                                                      |
| -------------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `name`         | `string` | — (required) | Store name (`cart` -> `CartStore` in `cart.store.ts`). Letters, digits, `.`, `_`, `-`; must start with a letter. |
| `path`         | `string` | `src/app`    | Target directory, relative to the project root.                                                                  |
| `entity`       | `string` | `unknown`    | TypeScript type of the entity held in state (`Product`, `Product[]`, `Map<string, Product>`).                    |
| `entityImport` | `string` | —            | Module the entity type is imported from (`./product.model`). Required when `entity` is not built in.             |

The `name` of every generator in this package is validated before anything is
written: a value that would not survive interpolation into TypeScript and into a
file path (quotes, `/`, `..`) is rejected with the value it received, instead of
producing a broken file or a raw devkit path error.

#### `http-interceptor` (alias `hi`)

| Option    | Type     | Default      | Description                                                      |
| --------- | -------- | ------------ | ---------------------------------------------------------------- |
| `name`    | `string` | — (required) | Interceptor name (`auth` -> `authInterceptor`).                  |
| `path`    | `string` | `src/app`    | Target directory, relative to the project root.                  |
| `retries` | `number` | `2`          | Retries for transient (5xx / network) errors before propagating. |

Register the generated interceptor:

```ts
provideHttpClient(withInterceptors([authInterceptor]));
```

#### `smart-dumb` (alias `sd`)

| Option   | Type     | Default      | Description                                                                    |
| -------- | -------- | ------------ | ------------------------------------------------------------------------------ |
| `name`   | `string` | — (required) | Base name (`user-list` -> `UserListContainerComponent` + `UserListComponent`). |
| `path`   | `string` | `src/app`    | Target directory, relative to the project root.                                |
| `prefix` | `string` | `app`        | Selector prefix.                                                               |

## Development

```bash
npm run build   # tsc + copy collection.json / templates into dist/
npm test        # build + run the Jasmine specs against dist/**/*_spec.js
```

The schematics are generators built with `apply` / `mergeWith` / `applyTemplates`
over `files/` template trees (`__name@dasherize__…` placeholders, `.template`
suffix). Tests use `SchematicTestRunner` / `UnitTestTree` from
`@angular-devkit/schematics/testing`. Publish from `dist/` (the build copies
`package.json`, `README.md`, `LICENSE` and `collection.json` there).
