# angular-schematics

[![CI](https://github.com/damiansire/angular-schematics/actions/workflows/ci.yml/badge.svg)](https://github.com/damiansire/angular-schematics/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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

In CI, the `release` workflow (`.github/workflows/release.yml`) runs on merge to
`main` and opens/updates a "Version Packages" PR with the pending bumps and
changelog. Publishing to npm stays a deliberate, manual step (`npm run
publish:dist`) — the workflow does **not** auto-publish. To let CI publish, add a
`publish:` step plus the `NPM_TOKEN` secret. The `ci` workflow runs lint +
format check + typecheck + build + tests (Node 18/20/22) on every push to `main`
and every PR.
