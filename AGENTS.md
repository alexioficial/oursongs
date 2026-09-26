# AGENTS.md

Guía para agentes que trabajen en este repo. El README explica el producto; esto
explica cómo tocarlo sin romperlo.

Todo lo que se ve (textos de la UI, rutas, mensajes de error) va **en español**.
El código —identificadores, campos de las colecciones, nombres de archivo— va en
inglés. Los comentarios, en español.

---

## 1. Antes de dar nada por terminado

Estos cuatro comandos tienen que pasar. No son opcionales y el orden importa poco:

```bash
bun run format   # prettier escribiendo; hazlo antes de lint
bun run lint     # prettier --check + eslint (config estricta, ver §6)
bun run check    # svelte-check: tipos de TS y de los componentes
bun test         # lógica musical (bun:test)
```

`bun run lint` y `bun run check` deben terminar con **0 errores y 0 avisos**. El
repo está así ahora mismo; si aparece un aviso nuevo es de tu cambio.

Si tocas algo del servidor o del build, además:

```bash
bun run build                      # el build de producción compila de verdad
```

---

## 2. Cómo correr el proyecto

```bash
bun install
cp .env.example .env               # ajusta MONGODB_URI
bun run create:user tuusuario --password "una contraseña larga"
bun run dev
```

Hace falta un MongoDB accesible. **Sin base, la app arranca igual**: `/login`,
`/api/health` y los redirects del guard funcionan sin tocar Mongo, así que se
puede verificar bastante sin levantar nada:

```bash
curl -i localhost:5173/login                 # 200
curl -i localhost:5173/canciones             # 303 → /login?redirectTo=…
curl -i -X POST localhost:5173/api/songs     # 401 JSON
```

Con la base caída, cualquier ruta que la consulte devuelve un **500 genérico** y
escribe el error real en el log del servidor. Es intencional: los mensajes
internos no salen al cliente.

---

## 3. Restricciones que no se negocian

Cada una de estas está puesta por una razón concreta y romperla da un fallo que
cuesta encontrar.

### 3.1. `mongodb` se queda en `^6`

Con `mongodb@7` entra `bson@7`, que al cargarse llama a `isBuildingSnapshot()` de
`node:v8`; **bun no lo implementa y el servidor no arranca**
(`ERR_NOT_IMPLEMENTED`). Lo peor: `bun run dev` funciona igual porque vite
pre-empaqueta la dependencia, así que el fallo solo aparece en el build de
producción y en los scripts sueltos, es decir, en el deploy.

Si alguna vez subes la versión, la comprobación es esta y tiene que salir sin
error:

```bash
bun -e "import('mongodb').then(() => console.log('ok'))"
```

### 3.2. `scripts/` no puede importar `$lib` ni `$env`

`scripts/createUser.ts` corre con `bun run`, fuera de SvelteKit: ahí los alias
`$lib` y el módulo virtual `$env/dynamic/private` no existen. Por eso:

- el script importa con rutas relativas (`../src/lib/server/password.ts`),
- `src/lib/server/password.ts` importa `../validation`, **no** `$lib/validation`,
- el script abre su propio `MongoClient` en vez de usar `$lib/server/db`.

Si añades un `import` a ese script, comprueba que la cadena entera esté libre de
alias y **actualiza los `COPY` del Dockerfile** (§8), que copia solo los tres
módulos que hoy necesita.

### 3.3. Variables de entorno: `dynamic`, nunca `static`

`src/lib/server/db.ts` lee `env.MONGODB_URI` de `$env/dynamic/private`. Con
`$env/static/private` las variables tendrían que existir **en tiempo de build**, y
en Coolify se inyectan en tiempo de ejecución: el deploy se rompería o, peor,
quedaría con valores viejos horneados en la imagen.

### 3.4. Las fechas se formatean en el servidor

`GET /api/songs/[id]` (y la descarga sin conexión) devuelven `updatedAtLabel` ya
formateado con `formatUpdatedAt` de `$lib/server/dates.ts`. Si formateas en el
componente, el HTML del servidor (UTC) y el del cliente (zona del usuario) no
coinciden y salta el aviso de hidratación. La zona sale de `TZ`.

### 3.5. Toda ruta pública nueva va a `PUBLIC_ROUTES`

`src/hooks.server.ts` bloquea **todo** lo que no esté en ese `Set`: las páginas
con un redirect a `/login`, y lo que empiece por `/api/` con un 401 JSON (un
redirect haría que el `fetch` del cliente recibiera el HTML del login en vez de
un error). Hoy la lista es `/login`, `/api/auth/login`, `/api/health` y
`/api/session` (el layout la pide también en `/login`). Añadir un
endpoint público y olvidarse de esto es el fallo más fácil de cometer aquí — le
pasó a `/api/health`, que existía pero contestaba 401 al healthcheck.

---

## 4. Por dónde pasa una petición

**Leer** → hay dos caminos, y cuál usa cada pantalla importa (§4.1):

- **Canciones y layout raíz**: carga **universal** (`+page.ts` / `+layout.ts`) que
  pide JSON a `GET /api/**` con `apiGet()` de `$lib/offline/load.ts`. Si el
  servidor no responde, lee la copia de IndexedDB.
- **Tags y Alinear**: `+page.server.ts`, que llama a `$lib/server/` directamente.
  Son pantallas de edición y sin red no tienen sentido.

En los dos casos salen DTOs ya serializados (ids y fechas como `string`, ver
`src/lib/types.ts`). Nunca se devuelve un `ObjectId` ni un `Date` al cliente.

**Escribir** → el componente llama a `jsonRequest()` de `$lib/client/json.ts`
contra `/api/**`, el endpoint valida con los módulos de `$lib/server/` y el
componente refresca con `invalidateAll()` (o navega).

```
src/
  hooks.server.ts            sesión → cabeceras de seguridad → guard (en ese orden)
  lib/
    music/chords.ts          transposición; puro, sin dependencias, con tests
    music/chordPlacements.ts posiciones de acordes sobre la letra (grafemas)
    music/chordSheet.ts      importar letras con acordes encima o ChordPro
    validation.ts            límites compartidos (cliente + servidor + scripts)
    types.ts                 DTOs que cruzan al cliente
    client/json.ts           fetch + traducción de `{ error }` a excepción
    client/ids.ts            UUID en el navegador (también sin https)
    offline/                 modo sin conexión (§4.1): db.ts (IndexedDB),
                             sync.svelte.ts (estado y sincronización),
                             load.ts (apiGet), logic.ts (puro, con tests)
    theme.ts                 tema claro/oscuro en cookie
    components/              Icon, Nav, PageHeader, EmptyState, Modal,
                             ConfirmDialog, SongForm, TagPicker, ChordLyrics,
                             ChordCatalogEditor, ChordAlignmentEditor
    server/
      db.ts                  conexión reusada + ensureIndexes + CI_COLLATION
      users.ts  session.ts   cuentas y sesiones
      songs.ts  tags.ts      el dominio y su validación
      password.ts            scrypt de node:crypto (sin alias, ver §3.2)
      errors.ts              ValidationError / ConflictError / NotFoundError
      apiHelpers.ts          readObjectBody, requireUserId, failure
      requestBody.ts         lectura del cuerpo con tope de tamaño
      text.ts                escapeRegex, slugify
  routes/
    canciones/  tags/  login/
    app-shell/               carcasa sin SSR que el service worker sirve sin red
    api/                     escritura + lecturas JSON de las cargas universales
  service-worker.ts          archivos de la app y la carcasa; nunca datos
scripts/createUser.ts        alta de usuarios (fuera de SvelteKit)
tests/*.test.mjs             bun:test importando el .ts directamente
```

### 4.1. Sin conexión

Cada vez que alguien entra (y cada vez que vuelve la red), `startOffline()` sube
las canciones creadas sin conexión y descarga el repertorio **entero** a
IndexedDB (`GET /api/offline/songs`, por páginas para enseñar el progreso en
`SyncStatus`). Sin servidor se puede ver todo y **solo crear**. Editar, borrar,
alinear y Tags quedan bloqueados (`connection.online`).

Lo que no se puede romper:

- **Nada de carga de servidor en el layout raíz ni en `canciones/`.** Si la hay,
  SvelteKit tiene que pedir sus datos al servidor antes de pintar y sin red la
  página falla. Por eso esas cargas son universales.
- **`paths.relative = false`** (`vite.config.ts`). Sin red, el service worker
  sirve la misma carcasa para cualquier URL, y con rutas relativas
  `/canciones/abc` buscaría `/canciones/_app/...` y no arrancaría.
- **El service worker no guarda datos**: ni `/api/**` ni `__data.json`. Los datos
  viven en IndexedDB. Una caché HTTP de datos serviría canciones viejas incluso
  con red.
- **Crear es idempotente por `clientId`** (UUID del cliente, índice único
  parcial). Si la subida se corta después de guardar, el reintento devuelve la
  misma canción en vez de duplicarla.
- **Cerrar sesión borra la copia** (`clearOfflineData`); si hay canciones sin
  subir, se avisa antes.

Para probarlo de verdad hace falta el build de producción: en `bun run dev`, Vite
sirve los módulos bajo demanda y el service worker no puede guardarlos. Apagar el
servidor es la forma realista de simular que no hay internet.

---

## 5. El dominio

### 5.1. El repertorio es compartido

**No hay comprobaciones de propiedad en ninguna parte y es a propósito**:
cualquier usuario con sesión ve y edita todas las canciones y todos los tags. Solo
se registra quién hizo qué (`createdBy`, `updatedBy`). Si algún día hace falta
privacidad, hay que añadir filtros en todas las consultas de `songs.ts` y
`tags.ts`, no un parche en la UI.

### 5.2. Colecciones e invariantes

| Colección  | Campos                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `users`    | `username` (único, insensible a mayúsculas), `passwordHash` (scrypt), `name?`                                                  |
| `sessions` | `tokenHash` (SHA-256 del token de la cookie), `userId`, `expiresAt` (índice TTL)                                               |
| `songs`    | `title`, `artist?`, `rhythm?`, `lyrics`, `chords` (`{id,value}[]`), `chordPlacements`, `tagIds`, `clientId?`, autoría y fechas |
| `tags`     | `name` (único, insensible a mayúsculas), `slug` (único)                                                                        |

Índices en `ensureIndexes` de `db.ts`; se crean al arrancar y `ensureIndex`
recrea el índice si choca por opciones (códigos 85/86). Sesiones: 30 días, y
además se comprueba `expiresAt` a mano porque el TTL de Mongo tarda hasta un
minuto en pasar.

Invariantes que hay que mantener:

- **`songs.tagIds` nunca apunta a un tag que no existe.** `resolveTagIds()`
  comprueba que existan antes de guardar, y `deleteTag()` hace `$pull` en las
  canciones **antes** de borrar el tag (si fallara el segundo paso, un tag sin
  canciones es inofensivo; canciones con un tag fantasma, no).
- **`chords` se guarda normalizado**: `normalizeChord()` deja `am7` como `Am7` y
  `F♯m` como `F#m`. La calidad se respeta tal cual la escribió el usuario.
- **Cada `chordPlacement` referencia un acorde existente** y usa un offset válido
  de la letra. Solo puede haber un acorde en cada posición. Al editar la letra,
  `SongForm` reajusta las posiciones y pide revisión si el cambio atraviesa una.
- **El id de un acorde lo pone el servidor o el cliente como UUID.** Un acorde
  nuevo sin id recibe uno al guardar; con id desconocido solo se acepta si es un
  UUID, porque al importar una letra pegada las posiciones tienen que apuntar a
  acordes que todavía no se han guardado.
- **El servidor no recorta la letra** (solo pasa CRLF a LF). Una línea de solo
  acordes, como una intro o un final, se guarda como una línea de espacios, y un
  `trim()` se la llevaría con sus acordes y descuadraría todos los offsets. Los
  extremos los recorta `SongForm` con `trimLyrics`, que sabe dónde hay acordes. No
  vuelvas a poner `trim()` en `normalizeLyrics`.
- **`updatedAt` siempre existe** (en el alta vale lo mismo que `createdAt`),
  porque la lista ordena por él.
- Los nombres únicos los decide el **índice**, no un `findOne` previo: así dos
  peticiones a la vez no crean `Rock` y `rock`. El catch traduce el error 11000 a
  `ConflictError`.

### 5.3. La transposición (`src/lib/music/chords.ts`)

Lo importante, y lo que no hay que "arreglar":

- El cálculo va sobre **clases de altura** (0-11, C = 0), nunca sobre las letras.
  Por eso **E→F y B→C salen como un solo semitono** sin ningún caso especial. Si
  alguien reescribe esto incrementando letras, vuelve el bug.
- Es **solo para la vista**: `ChordLyrics.svelte` guarda los semitonos en estado
  local y no manda nada al servidor. No añadas un endpoint para "guardar
  transpuesto" sin pedirlo explícitamente.
- `transposeChord(x, 0)` devuelve el texto **intacto**, para que un `Cb` escrito a
  mano no se convierta en su enarmónico `B`.
- `wrapSemitones` mantiene el signo y vuelve a 0 a los ±12 (y no devuelve `-0`).
- La escritura (♯/♭) se resuelve **para toda la lista**, no acorde por acorde, con
  `resolveSpelling`: manda la mayoría y con empate gana el sostenido.
- Lo que no parsea se devuelve tal cual en vez de romperse, y `isValidChord` lo
  rechaza al guardar.

Si tocas este archivo, los tests de `tests/chords.test.mjs` son el contrato: 27
casos que incluyen `G#m7add11/D#`, `C6/9` (barra que no es bajo), la vuelta de
octava y la basura. Añade casos, no los relajes.

### 5.4. Validación

La API **no se fía de nada**: los campos de `SongInput` son `unknown` y cada
normalizador (`normalizeTitle`, `normalizeChordCatalog`…) decide. Los límites viven en
`src/lib/validation.ts` y los usan también los formularios, para que el cliente
avise de lo mismo que rechaza el servidor:

`username` 3-20 caracteres · contraseña 8-200 · nombre 60 · título y artista 120 · ritmo 60 (texto libre) ·
letra 20 000 · nombre de tag 40 · 200 acordes por canción · cuerpo JSON 64 KB.

Errores: lanza `ValidationError` (400), `ConflictError` (409) o `NotFoundError`
(404) de `$lib/server/errors.ts`. **Un `Error` pelado sale como 500 genérico** y
se registra en el log — que es lo correcto para un fallo inesperado, pero no para
algo que el usuario pueda corregir.

---

## 6. Reglas de lint y de Svelte que muerden

La config de eslint es la recomendada de `eslint-plugin-svelte`, que es estricta.
Las cuatro que van a saltar:

- **`svelte/no-navigation-without-resolve`**: todo `href` y todo `goto()` pasan por
  `resolve()` de `$app/paths`, que además comprueba la ruta contra los tipos:

  ```ts
  resolve('/canciones'); // ruta fija
  resolve('/canciones/[id]', { id: song.id }); // ruta dinámica
  resolve(`/canciones?${query}`); // pathname + query, también vale
  ```

  Envolver `resolve()` en un template literal **no** cuela para la regla; si
  necesitas componer, guarda el resultado en una variable y pásala a `goto()`
  (así se hace en `canciones/+page.svelte`).

- **`svelte/prefer-svelte-reactivity`**: dentro de un componente no vale crear y
  mutar instancias de `URL`, `URLSearchParams`, `Date`, `Map` o `Set` nativos; la
  regla pide las versiones de `svelte/reactivity`. En `canciones/+page.svelte` la
  query se compone a mano con `encodeURIComponent` en lugar de arrastrar una clase
  reactiva para algo de usar y tirar.
- **`svelte/prefer-writable-derived`**: `$state` + `$effect` para derivar un valor
  está prohibido; usa `$derived`.
- **`svelte/no-at-html-tags`**: solo `Icon.svelte` usa `{@html}`, con su
  `eslint-disable-next-line` y el comentario que explica que el contenido sale de
  un mapa estático. No lo copies a otro sitio.

Svelte 5 en modo runes está **forzado** en `vite.config.ts`. Dos patrones del repo:

- El valor inicial de un `$state` que viene de una prop se envuelve en `untrack`
  (ver `SongForm.svelte`), que es lo que dice "solo me interesa el valor inicial"
  y calla el aviso `state_referenced_locally`.
- Los componentes que escriben en el padre usan `$bindable` (`TagPicker`).

---

## 7. Estilo

Prettier manda: **tabuladores**, comillas simples, sin coma final, 100 columnas.
No pelees con él, corre `bun run format`.

Los comentarios explican **por qué**, no qué. El repo está lleno de ellos y todos
justifican una decisión (por qué se reusa la promesa de conexión, por qué el
`$pull` va antes del `delete`, por qué la fecha se formatea en el servidor). Si
tu comentario repite lo que dice la línea de código, bórralo; si explica una
trampa, quédate con él.

CSS: la paleta es **solo grises, negro y blanco, sin color primario**. Los tokens
y las clases (`.btn`, `.btn-primary`, `.btn-danger`, `.input`, `.card`, `.chip`,
`.badge`, `.label`, `.section`, `.mono`…) están en `src/routes/layout.css`. Reutiliza
esas clases y **no introduzcas colores**: lo destructivo se marca con borde claro
y texto en blanco, no en rojo. El resto de estilos van en el `<style>` del
componente, con variables `var(--color-…)`.

Hay tema claro y oscuro: `layout.css` redefine los tokens bajo
`:root[data-theme='light']`. El tema vive en la cookie `theme` (`src/lib/theme.ts`)
y `hooks.server.ts` lo escribe en el `<html>` al renderizar, para que la página no
parpadee. Por eso **nada de colores fijos** (`#fff`, `#111`…) para fondos, textos
o bordes en los componentes: se verían bien en un tema y mal en el otro (las
sombras negras sí valen en los dos). Si hace falta un color nuevo, es un token más
en los dos bloques, como `--color-backdrop`.

Los iconos son un mapa estático en `Icon.svelte` (trazo, `currentColor`, sin
dependencias). Para uno nuevo, añade la entrada al mapa.

---

## 8. Deploy (Coolify)

`Dockerfile` multi-etapa con bun: `deps` → `build` → `prod-deps` → `runtime`, que
corre como usuario `bun` sin privilegios y sirve `bun ./build/index.js` en
`$HOST:$PORT` (3000). **No define `HEALTHCHECK`** a propósito; si se quiere, se
configura en Coolify contra `GET /api/health`.

Variables de la aplicación: `MONGODB_URI` (obligatoria), `MONGODB_DB`, `ORIGIN`
(obligatoria, con `https://`: Traefik termina el TLS y sin ella adapter-node
compone mal las URLs), `TZ`.

La etapa de runtime copia, además del build, **solo** `scripts/`,
`src/lib/validation.ts`, `src/lib/server/errors.ts` y
`src/lib/server/password.ts`, para poder crear usuarios desde el terminal del
contenedor:

```bash
bun run create:user pepe --password "una contraseña larga"   # --reset para cambiarla
```

`USUARIOS.md` documenta el alta de cuentas de cara al operador (reglas, errores,
baja). Si cambias el script, actualízalo.

Si cambian los imports del script, esa lista de `COPY` hay que actualizarla o el
comando falla **solo en producción**.

`.dockerignore` recorta el contexto (fuera `tests`, `*.md`, configs de lint). Si
añades un archivo que el build necesita, comprueba que no esté excluido.

---

## 9. Recetas

**Un campo nuevo en la canción**: `SongDoc` y el DTO en `types.ts` → su
normalizador y el `$set` de `updateSong` en `songs.ts` → el límite en
`validation.ts` → el campo en `SongForm.svelte` → mostrarlo en
`canciones/[id]/+page.svelte`. Si hay que buscar o ordenar por él, índice en
`db.ts`.

**Un endpoint nuevo**: `src/routes/api/…/+server.ts` con el patrón de los
existentes — `requireUserId(locals)`, `readObjectBody(request)`, llamada al módulo
de dominio, `return json(...)` y `catch` con `return failure(error)`. La
validación va en el módulo de `$lib/server/`, no en el endpoint. Si tiene que ser
público, §3.5.

**Una pantalla nueva**: carpeta en `src/routes/`, `+page.server.ts` (o `+page.ts`
con `apiGet()` si tiene que verse sin conexión, §4.1) que devuelva
DTOs, `+page.svelte` con `PageHeader` y las clases de `layout.css`, y la entrada en
`Nav.svelte` (con `resolve()`).

**Tocar la lógica musical**: primero el test en `tests/chords.test.mjs`, luego el
código. Los tests son `.mjs` e importan el `.ts` directamente; solo cubren módulos
puros, que es lo que se puede probar sin base de datos.

---

## 10. Cosas que este repo no tiene (y no son un olvido)

- **Sin registro público**: las cuentas se crean con el script. No añadas
  `/register` sin pedirlo.
- **Sin roles ni permisos**: el repertorio es compartido (§5.1).
- **Sin tests de la capa de base de datos**: se escribió sin un Mongo a mano, así
  que el ida y vuelta real no está cubierto. Si añades esa cobertura, que no sea a
  costa de meter un mongod en el repo.
