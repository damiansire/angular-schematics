# angular-schematics

Monorepo de schematics de Angular. Cada paquete se publica en npm con su propio
nombre y vive bajo [`packages/`](packages/).

## Paquetes

| Paquete | Carpeta | Descripción |
|---|---|---|
| `inline-template-schematic` | [`packages/angular-inline-migration-schematic`](packages/angular-inline-migration-schematic) | Migra `template`/`styles` inline de los `@Component` a archivos externos `.html`/`.scss`. |

## Desarrollo

Workspaces de npm. Desde la raíz:

```bash
npm install        # instala todas las dependencias (hoisted)
npm run build      # buildea los paquetes
npm test           # corre los tests de cada paquete
```

Para trabajar sobre un paquete puntual, usá `-w <nombre>`, por ejemplo
`npm run build -w inline-template-schematic`.
