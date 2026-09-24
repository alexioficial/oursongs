# OurSongs

Repertorio compartido de canciones: letra, acordes y tags, con transposición por
semitonos en la vista.

Bun + SvelteKit + TypeScript + MongoDB. El repertorio es **uno solo para todos**:
cualquier usuario con sesión ve y edita todas las canciones y todos los tags, y
en cada canción queda registrado quién la creó y quién la tocó por última vez.

## Puesta en marcha

```bash
bun install
cp .env.example .env     # ajusta MONGODB_URI si hace falta
bun run create:user tuusuario --password "una contraseña larga"
bun run dev
```

No hay registro público: las cuentas se crean con el script (ver abajo).

## Variables de entorno

| Variable      | Para qué                                                           |
| ------------- | ------------------------------------------------------------------ |
| `MONGODB_URI` | Cadena de conexión. En local, `mongodb://127.0.0.1:27017`.         |
| `MONGODB_DB`  | Nombre de la base. Por defecto `oursongs`.                         |
| `ORIGIN`      | Origen público; en producción adapter-node valida con él los POST. |
| `PORT`        | Puerto del servidor en producción.                                 |
| `TZ`          | Zona con la que el servidor formatea las fechas que se muestran.   |

## Scripts

| Script                | Qué hace                                              |
| --------------------- | ----------------------------------------------------- |
| `bun run dev`         | Servidor de desarrollo.                               |
| `bun run build`       | Build de producción (adapter-node, sale en `build/`). |
| `bun run preview`     | Sirve el build.                                       |
| `bun run check`       | `svelte-check` (tipos de TS y de los componentes).    |
| `bun run lint`        | Prettier en modo comprobación + ESLint.               |
| `bun run format`      | Prettier escribiendo.                                 |
| `bun test`            | Tests de la lógica musical.                           |
| `bun run create:user` | Alta de usuarios y cambio de contraseña.              |

### Usuarios

```bash
bun run create:user pepe                              # pide la contraseña por consola
bun run create:user pepe --password "…" --name "Pepe" # sin interacción
bun run create:user pepe --password "…" --reset       # cambia la contraseña y cierra sus sesiones
```

`prompt` hace eco de lo que se escribe; para no dejar la contraseña en el
historial de la terminal puedes pasarla por `OURSONGS_PASSWORD`.

## Las dos pantallas

- **Canciones** (`/canciones`) — lista con buscador por título/artista y filtro
  por tags (todo en la URL, así que un enlace reproduce la misma vista). Desde
  aquí se registra una canción nueva.
  - **Ficha** (`/canciones/[id]`) — acordes con la transposición, letra completa,
    edición y borrado.
- **Tags** (`/tags`) — crear, renombrar y borrar tags, y asignar un tag a varias
  canciones de golpe. Borrar un tag lo quita de sus canciones; las canciones no
  se tocan.

Los tags también se asignan desde el formulario de la canción, que es el camino
corto cuando estás registrándola.

## La transposición

Una canción guarda sus acordes como una lista de strings, uno por acorde
(`["C", "G/B", "Am7", "G#m7add11"]`). En la ficha hay un control para subir o
bajar semitonos cuantas veces quieras: **es solo para ver**. Nunca se manda al
servidor ni cambia lo guardado; al recargar vuelve a aparecer el original.

La lógica está en [`src/lib/music/chords.ts`](src/lib/music/chords.ts), es pura y
está cubierta por `tests/chords.test.mjs`:

- El cálculo va sobre **clases de altura** (0-11, C = 0), nunca sobre las letras.
  Por eso los dos casos especiales de la escala salen solos: de **E a F** y de
  **B a C** hay un semitono, no dos (`E` + 1 = `F`, `B` + 1 = `C`).
- La raíz cambia; la calidad y las extensiones se copian tal cual:
  `G#m7add11` + 1 = `Am7add11`, `F7` + 1 = `F#7`, `Amaj7` + 2 = `Bmaj7`.
- En los acordes con bajo se transponen las dos notas:
  `G#m7add11/D#` + 2 = `A#m7add11/F`.
- Doce semitonos arriba o abajo vuelven al punto de partida.
- **Sostenidos o bemoles**: por defecto se respeta lo que ya usaba la canción
  (una canción en `Bb` sigue en bemoles), y hay un botón ♯/♭ para forzarlo.
- Lo que no se entiende como acorde se deja intacto en vez de romperse, y no se
  puede guardar: el formulario marca en el momento lo que no cuela.

## Estructura

```
src/
  hooks.server.ts           sesión, guard de rutas y cabeceras de seguridad
  lib/
    music/chords.ts         transposición (puro, cliente y servidor)
    validation.ts           límites y formatos compartidos
    types.ts                tipos que cruzan al cliente (ids y fechas ya en string)
    client/json.ts          llamadas a la API desde el navegador
    components/             UI (Icon, Nav, SongForm, ChordBoard, TagPicker…)
    server/
      db.ts                 conexión reusada + índices
      users.ts session.ts   cuentas y sesiones (token hasheado en la base)
      songs.ts tags.ts      el dominio, con la validación de entrada
      errors.ts             errores con status propio (400/404/409)
      apiHelpers.ts         lectura del cuerpo y traducción de errores
  routes/
    canciones/ tags/ login/ las pantallas
    api/                    endpoints JSON de escritura
scripts/createUser.ts       alta de usuarios (se conecta a Mongo por su cuenta)
```

Las pantallas leen con `+page.server.ts` y escriben contra `/api/**`. La
validación vive en `src/lib/server/*.ts`, así que la API no se fía de nada de lo
que llega: cada campo entra como `unknown` y sale normalizado o con un 400.

## Colecciones

- **users** — `username` (único sin importar mayúsculas), `passwordHash`
  (scrypt de `node:crypto`), `name?`.
- **sessions** — solo el `tokenHash` (SHA-256 del token de la cookie), con índice
  TTL para que Mongo limpie las vencidas.
- **songs** — `title`, `artist?`, `lyrics` (un único string), `chords` (lista de
  strings), `tagIds`, `createdBy`/`createdAt`, `updatedBy`/`updatedAt`.
- **tags** — `name` (único sin importar mayúsculas), `slug`.

Los índices se crean al arrancar, en `ensureIndexes` de `src/lib/server/db.ts`.

## Un aviso sobre la versión del driver

La dependencia está fijada en `mongodb@^6.21.0` **a propósito**. Con
`mongodb@7` entra `bson@7`, que al cargarse llama a `isBuildingSnapshot()` de
`node:v8`; bun (1.3.14) no lo implementa y el servidor **no arranca**:

```
NotImplementedError: node:v8 isBuildingSnapshot is not yet implemented in Bun.
```

El dev server aguanta porque vite pre-empaqueta la dependencia, así que el fallo
solo aparece en el build de producción y en los scripts. Antes de subir a la 7
hay que comprobar que `bun -e "import('mongodb')"` termina sin error.

## Producción (Coolify)

El `Dockerfile` está pensado para el build pack "Dockerfile" de Coolify:
construye con bun, sirve el build de adapter-node en `$HOST:$PORT` (3000) y corre
como usuario sin privilegios. Configura `MONGODB_URI`, `ORIGIN` y `TZ` como
variables de entorno de la aplicación; se leen en caliente, así que cambiarlas
solo pide reiniciar, no reconstruir.

- **Health check**: la imagen no define ninguno. Si quieres uno, configúralo en
  Coolify contra `GET /api/health`, que responde `{"ok":true}` sin sesión y sin
  consultar Mongo — mide si el proceso sirve, que es lo que debería decidir un
  reinicio.
- **Primer usuario**: desde el terminal del contenedor,
  `bun run create:user tuusuario --password "…"`. La imagen lleva el script y los
  tres módulos que necesita.
- `ORIGIN` con `https://` importa: Traefik termina el TLS y sin ella adapter-node
  compone mal las URLs detrás del proxy.
