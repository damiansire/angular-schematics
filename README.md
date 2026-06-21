# angular-schematics

Monorepo de schematics de Angular. Cada paquete está pensado para publicarse en
npm con su propio nombre y vive bajo [`packages/`](packages/).

> **Estado:** todavía ningún paquete está publicado en npm. Por ahora se usan
> mediante `npm link` (ver el README de cada paquete).

## Paquetes

| Paquete | Carpeta | Descripción |
|---|---|---|
| `angular-inline-migration-schematic` | [`packages/angular-inline-migration-schematic`](packages/angular-inline-migration-schematic) | Migra `template`/`styles` inline de los `@Component` a archivos externos `.html`/`.scss`. |

## Desarrollo

Workspaces de npm. Desde la raíz:

```bash
npm install        # instala todas las dependencias (hoisted)
npm run build      # buildea los paquetes
npm test           # corre los tests de cada paquete
```

Para trabajar sobre un paquete puntual, usá `-w <nombre>`, por ejemplo
`npm run build -w angular-inline-migration-schematic`.
