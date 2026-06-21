# angular-schematics

Monorepo de schematics de Angular. Cada paquete está pensado para publicarse en
npm con su propio nombre y vive bajo [`packages/`](packages/).

> **Estado:** todavía ningún paquete está publicado en npm. Por ahora se usan
> mediante `npm link` (ver el README de cada paquete).

## Paquetes

| Paquete                              | Carpeta                                                                                      | Descripción                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `angular-inline-migration-schematic` | [`packages/angular-inline-migration-schematic`](packages/angular-inline-migration-schematic) | Migra `template`/`styles` inline de los `@Component` a archivos externos `.html`/`.scss`.                                                                            |
| `angular-generators-schematic`       | [`packages/angular-generators-schematic`](packages/angular-generators-schematic)             | Generadores: store con signals (`signal-store`), interceptor HTTP funcional con retry (`http-interceptor`) y par smart/dumb container+presentational (`smart-dumb`). |

## Desarrollo

Workspaces de npm. Desde la raíz:

```bash
npm install        # instala todas las dependencias (hoisted)
npm run build      # buildea los paquetes
npm test           # corre los tests de cada paquete
```

Para trabajar sobre un paquete puntual, usá `-w <nombre>`, por ejemplo
`npm run build -w angular-inline-migration-schematic`.

## Versionado y release

El versionado y el changelog se gestionan con
[Changesets](https://github.com/changesets/changesets):

```bash
npm run changeset   # describir el cambio (genera un .md en .changeset/)
npm run version     # consume los changesets: bump de versión + CHANGELOG
npm run publish:dist  # build + npm publish del dist/ del paquete
```

En CI, el workflow `release` (`.github/workflows/release.yml`) automatiza el
flujo: al mergear a `main` abre/actualiza un PR "Version Packages" con los
bumps, y cuando ese PR se mergea publica a npm desde `dist/`. Requiere el secret
`NPM_TOKEN`. El workflow `ci` corre typecheck + build + tests (Node 18/20/22) en
cada PR.
