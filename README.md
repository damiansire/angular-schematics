# angular-schematics

A monorepo of Angular schematics. Each package is designed to be published to npm
under its own name and lives under [`packages/`](packages/).

> **Status:** no package is published to npm yet. For now they are used via
> `npm link` (see each package's README).

## Packages

| Package                              | Folder                                                                                       | Description                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `angular-inline-migration-schematic` | [`packages/angular-inline-migration-schematic`](packages/angular-inline-migration-schematic) | Migrates inline `template`/`styles` from `@Component` decorators to external `.html`/`.scss` files.                                                                          |
| `angular-generators-schematic`       | [`packages/angular-generators-schematic`](packages/angular-generators-schematic)             | Generators: signal-based store (`signal-store`), functional HTTP interceptor with retry (`http-interceptor`), and a smart/dumb container+presentational pair (`smart-dumb`). |

## Development

npm workspaces. From the repo root:

```bash
npm install        # install all dependencies (hoisted)
npm run build      # build the packages
npm test           # run each package's tests
```

To work on a single package, use `-w <name>`, e.g.
`npm run build -w angular-inline-migration-schematic`.

## Versioning and release

Versioning and the changelog are managed with
[Changesets](https://github.com/changesets/changesets):

```bash
npm run changeset   # describe the change (generates a .md in .changeset/)
npm run version     # consume the changesets: version bump + CHANGELOG
npm run publish:dist  # build + npm publish of the package's dist/
```

In CI, the `release` workflow (`.github/workflows/release.yml`) automates the
flow: on merge to `main` it opens/updates a "Version Packages" PR with the
bumps, and when that PR is merged it publishes to npm from `dist/`. It requires
the `NPM_TOKEN` secret. The `ci` workflow runs typecheck + build + tests
(Node 18/20/22) on every PR.
