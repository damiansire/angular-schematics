<!-- ALLOW_PUBLIC: barra de calidad y convenciones del repo. Sin estrategia interna. -->

# CLAUDE.md (angular-schematics)

Instrucciones de este repo para cualquier agente o humano que lo toque.

**Arquetipo:** colección npm de Angular Schematics (3 generadores de scaffolding + `ng-add`
por paquete + 1 codemod de migración de inline a externo), en monorepo npm-workspaces con
pipeline de release por Changesets. Techo alcanzable: **referencia**, que otro autor de
schematics copie el approach tal cual.

**El gate es uno solo:** `npm run verify` (lint con 0 warnings, format:check, typecheck,
build de los workspaces, tests y umbral de cobertura). Es exactamente lo que corre CI.
Si local y CI divergen, el bug es el pipeline, no el checkout.

```bash
npm ci
npm run verify                                   # lo mismo que corre CI antes de mergear
npm test -w angular-inline-migration-schematic   # un solo paquete
```

---

## Estándar nivel mundial

Esta sección no es aspiracional: es la barra contra la que se escribe cada línea nueva
**antes** de escribirla. La fuente es el corpus de saqueos a OSS top, no el criterio del
momento. Cada regla cita de dónde sale.

### Piso Craft (a-j): la regla raíz es Intención Clara / Zero-Guessing

_(fuente: `architecture/fellow-standard.md` del corpus, barra transversal)_ El código debe ser
tan evidente que un senior entienda el porqué sin ejecutarlo ni preguntar.

- **a. El nombre revela la intención de dominio, no el mecanismo.** Violado con `data`,
  `handle`, `process`, `manager` donde el dominio tiene término propio (`resolveConflict` y
  `findComponentDecorator` son el estándar de la casa).
- **b. Los comentarios explican POR QUÉ, nunca QUÉ.** Un comentario que parafrasea el código
  es señal de que hay que renombrar o extraer.
- **c. Superficie pública autodocumentada.** La firma comunica el contrato. En un schematic la
  superficie pública son `schema.json`, la factory exportada y `collection.json`: si hay que
  leer el cuerpo para saber qué hace una opción, está violado.
- **d. Impacto mínimo al cambiar el core.** Violado si la misma regla vive duplicada en dos
  lugares que pueden divergir (el caso vivo de este repo: la reescritura del decorador
  duplicada entre el paso de `template` y el de `styles`).
- **e. Features borrables sin cirugía.** Cada generador vive localizado; sacarlo no deja
  tentáculos en los otros.
- **f. Flujo de datos inmutable y rastreable.** El `Tree` se muta por una lista de cambios
  ordenada, no por escrituras dispersas.
- **g. Consistencia ante excepción.** Si algo falla a mitad de un archivo, ese archivo queda
  como estaba o el schematic aborta. Nunca un `.ts` a medio migrar reportado como éxito.
- **h. Los boundaries comunican lo que pasa.** Todo camino de skip, conflicto o error sale por
  `context.logger` y está cubierto por un test que asserta el mensaje. Un fallo que se traga
  sin log es violación aunque el schematic "funcione".
- **i. Límites explícitos: timeouts, reintentos acotados, presupuesto.** Aplica también al
  código que este repo **emite**: el interceptor generado es código de producción de otro.
- **j. Fail-closed donde importa.** Ante la duda, denegar o abortar. Un codemod que ante la
  duda escribe es fail-open.

### Legibilidad en frío (k-m): el artefacto demuestra su propósito sin leer el código

_(fuente: `architecture/fellow-standard.md` + destilado de legibilidad en frío del corpus;
repos citados: ripgrep, SQLite, TechEmpower, guías OSS de GitHub y GitLab)_ Su ausencia no baja
el craft, deja el trabajo **sub-descripto**, que es el modo de falla más caro en un repo público.

- **k. El README lidera con prueba visible y framing honesto.** Primer screenful: qué es, para
  quién, y un ejemplo ejecutable real. Para un schematic la prueba visible es el comando
  `ng generate` con su **output**, el árbol de archivos que produce, no una descripción.
  Nombre y descripción tienen que igualar lo que el repo hace hoy.
- **l. Donde prometés robustez o performance, la prueba está y es reproducible.** Este repo
  promete **robustez** (un codemod que toca código fuente ajeno), así que el equivalente del
  benchmark con números es la **matriz de casos borde ejercitada en tests**: `styleUrl`
  singular, dos `@Component` en un archivo, styles no literales, destino preexistente en los
  tres modos de `onConflict`, indentación no estándar. Prometer "seguro" sin ese corpus de
  casos es claim sin prueba.
- **m. Framing honesto: se reconoce el límite del claim.** Se dice dónde NO aplica: qué no
  migra, qué no valida, qué majors del devkit se testean. La vulnerabilidad calibrada da más
  confianza que un número pulido (ripgrep declara sus propios benchmarks perdidos).

### Techo de Craft: lo que separa "ok" de "referencia"

_(fuente: sección Techo del estándar transversal, destilada de SQLite, PostgreSQL, Kubernetes,
LLVM, AWS Builders' Library)_ Idea rectora: los repos de referencia convierten la calidad en
**hecho machine-enforced**, no en convención.

- **Nombres y superficie:** imposible de malusar, no solo legible. Para un schematic: el
  `schema.json` con `pattern`/`enum` que rechaza la entrada inválida ANTES de que el código la
  vea, espejado por una validación en runtime con mensaje accionable.
- **Encapsulamiento:** el boundary como hecho de CI, no como comentario (import-boss de K8s).
- **Integridad de estado:** invariante observable y ejercitado con fault injection. Acá: un
  test que fuerza el error a mitad de archivo y afirma que el `.ts` quedó intacto.
- **Observabilidad:** el contexto se captura en el ORIGEN y el render se difiere.
- **Resiliencia:** cap exponencial finito, **jitter obligatorio**, stop por presupuesto de
  tiempo y UN presupuesto por llamada. Vale para el interceptor que este repo genera.
- **Fail-closed:** la rama por defecto de toda decisión deniega.

### Reglas enforzables del stack

**TypeScript**

1. **La estrictez vive en UN solo lugar.** `tsconfig.base.json` es la barra; los tsconfig hoja
   solo declaran `outDir`, `rootDir`, `lib`, `types`. Un hoja que re-declara flags de
   strictness es drift y se borra. _(saqueo node-ts: Backstage, Directus, n8n; verificado 3-0)_
2. **Techo de strictness, no piso.** Además de `strict`: `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`,
   `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
   `useUnknownInCatchVariables`, `allowUnreachableCode: false`, `allowUnusedLabels: false`,
   `isolatedModules`, `forceConsistentCasingInFileNames`. Regla de la casa: una codebase chica
   nace con el techo, porque el costo es cero al inicio y solo sube con el tiempo.
   _(saqueos: node-ts divergencia D1 sobre Directus; remeda/remeda; TanStack/query)_
3. **`as Type` es deuda que se justifica o no existe.** Cast explícito sin type guard ni
   validación en runtime se marca MAYOR. `any` es BLOCKER: el tipo de lo desconocido es
   `unknown`. _(saqueo `typescript/strict-loopholes.md`, inspirado en tRPC y Nx)_
4. **Exhaustividad en uniones:** el `default` de un switch sobre una union asigna a `never` o
   lanza. _(mismo saqueo)_

**Angular Schematics, el núcleo del repo**

5. **Nunca aritmética de strings ni de offsets a mano para mutar código.** Se ubica por AST y
   se aplica por lista de `Change` ordenada: `getDecoratorMetadata` + `findNodes` +
   `InsertChange`/`RemoveChange` + `applyToUpdateRecorder`, o el orden back-to-front de
   `applyChangesToString`. Esa lista aplicada con offset acumulado es lo que hace imposible la
   clase entera de bugs de offsets stale. Las utilidades ya vienen en
   `@schematics/angular/utility`: se importan, no se reescriben.
   _(saqueo a nrwl/nx + angular/angular-cli ast-utils)_
6. **Todo schematic se testea sobre un `Tree` real,** con `SchematicTestRunner` y
   `createTreeWithEmptyWorkspace`/`createTestApp`, asercionando el árbol resultante y el
   contenido del archivo, no un substring optimista.
   _(saqueo a angular/components, `ng-add-index.spec.ts`; y a nrwl/nx)_
7. **La compatibilidad hacia atrás es contrato declarado, no esperanza.** El rango de majors
   soportados del devkit se declara y se **testea en matriz** (el job `devkit-compat` ya lo
   hace). Si el rango declarado y la matriz no coinciden, uno de los dos miente.
   _(saqueo a analogjs/analog: peerDependencies multi-major y contract test contra la
   dependencia más volátil)_
8. **Preferí AST parsing sobre regex** para manipular archivos, y usá sintaxis Angular moderna
   (standalone, `inject`, signals, control flow) en TODO lo que el repo emite: el template
   generado es la cara del proyecto. _(saqueo al AGENTS.md de analogjs/analog)_

**Empaquetado y distribución**

9. **Lo que se publica es una allowlist, y esa allowlist se verifica.** `files` explícito,
   `sideEffects: false`, cero specs en el tarball. Un allowlist que es espejo manual del layout
   se rompe en silencio: el gate es `npm pack --dry-run` chequeado, no la lectura.
   _(saqueos a sindresorhus/type-fest y remeda/remeda)_
10. **`publishConfig.provenance` implica el entorno que lo soporta** (`id-token: write` en el
    workflow que publica). Declarar la bandera sin el camino que la sostiene es contrato roto.
    _(saqueo a analogjs/analog)_
11. **Versionado y changelog por Changesets,** y el publish nunca es un paso improvisado.

**CI y verificación**

12. **Typecheck es un gate propio,** no un efecto colateral del build (`tsc --noEmit`), y no
    lleva `continue-on-error`. _(saqueo node-ts: n8n y Backstage; 3-0)_
13. **Cero enmascaramiento de fallos:** ni un `continue-on-error` ni un `|| true` en los
    workflows. Las excepciones se documentan en el propio workflow.
    _(saqueo node-ts: n8n, verificado por grep sobre su CI)_
14. **`npm test` local == CI.** Existe UN comando (`npm run verify`) que corre la misma lista
    que el workflow, y el workflow lo invoca a él, para que no puedan divergir.
    _(saqueo a sindresorhus/type-fest, regla `run-p test:*`)_
15. **Cobertura con umbral que gatea** (`c8` con `check-coverage` en `.c8rc.json`). Honestidad
    sobre el origen: el mecanismo está verificado en OSS top, pero **ningún** repo top del set
    gatea cobertura por umbral. Esto es barra propia de la casa, se sostiene como tal y no se
    cita como "lo que hacen los top". El umbral es ratchet: sube, no baja.
    _(saqueo node-ts, divergencia D4, con su caveat explícito)_
16. **Actions de terceros pinneadas y lockfile determinista.** _(saqueo node-ts: n8n, Backstage)_

### Documentación

_(fuente: ítems k-m del estándar transversal y el destilado de legibilidad en frío)_ El README
es parte del producto y se gatea como tal.

- **El README nombra al proyecto igual que el manifest.** El `name`, la `description` del
  `package.json` y el título del README dicen lo mismo. Si el paquete se llama
  `angular-generators-schematic`, el README no habla de otra cosa.
- **No linkea a archivos que no existen** ni a comandos que no funcionan. `links.yml` valida
  las URLs, que es la capa barata; la capa que importa es que **los comandos documentados
  produzcan lo que dicen**: el ejemplo de la portada es un contrato ejecutable.
- **No es un molde reciclado.** Nada de secciones heredadas de otro repo, badges que no
  corresponden, ni un "Contributing" genérico que no describe este flujo.
- **El estado declarado es el estado real.** Si un paquete está publicado en npm, el README no
  puede decir que no lo está. El drift entre doc y realidad es un bug y se arregla en el mismo
  commit que lo produce.
- **Scope por negación visible.** Una sección de límites ("qué NO migra", "cuándo no usar
  esto") distingue alcance deliberado de deriva; su ausencia deja la altitud sin evidencia
  observable (SQLite "Distinctive Features", ripgrep "Why shouldn't I use ripgrep?").

---

## Do NOT (anti over-engineering)

_(saqueo a la sección "Do NOT" del AGENTS.md de analogjs/analog)_

- No abstracciones para operaciones de una sola vez.
- No comentarios ni anotaciones en código que no tocaste.
- No manejo de errores para escenarios imposibles.
- No diseñar para requisitos hipotéticos.
- No debilitar un gate (lint, tsconfig, umbral de cobertura, tests) para que algo pase: si el
  gate molesta, o el problema es el código, o el gate está mal argumentado y eso se discute.

## Convenciones del repo

- Commits: conventional commits **en español** (`feat(scope): ...`, `fix(...)`, `chore(...)`).
- `git push` solo cuando se pida. `npm publish` nunca sin pedido explícito.
- Artefactos de proceso (`_audit/`, `_audits/`, `AUDITORIA.md`, `coverage/`) están
  gitignorados: no son el deliverable y no se publican.
- `.gitattributes` fija `eol=lf`. Los `.template` se copian verbatim: un CRLF filtrado cambiaría
  el archivo que termina viendo el usuario final.
