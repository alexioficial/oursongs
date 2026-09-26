# Crear usuarios

No hay registro público: **todas las cuentas se crean a mano** con
`bun run create:user`, que ejecuta [`scripts/createUser.ts`](scripts/createUser.ts).
La pantalla de login solo comprueba credenciales, no da de alta a nadie.

El script se conecta a MongoDB por su cuenta (no pasa por SvelteKit), así que
sirve igual en local que dentro del contenedor de producción.

## El comando

```bash
bun run create:user <usuario> [--password "…"] [--name "…"] [--reset]
```

| Argumento    | Qué hace                                                            |
| ------------ | ------------------------------------------------------------------- |
| `<usuario>`  | Obligatorio. Es con lo que se inicia sesión.                        |
| `--password` | La contraseña. Si no la pasas, el script la pide por consola.       |
| `--name`     | Nombre para mostrar. Opcional.                                      |
| `--reset`    | El usuario ya existe: cámbiale la contraseña y cierra sus sesiones. |

El primer argumento suelto es el usuario y el segundo, si lo hay, el nombre:
`bun run create:user pepe "Pepe Pérez"` equivale a usar `--name`.

## En local

```bash
cp .env.example .env                                    # solo la primera vez
bun run create:user pepe --password "una contraseña larga"
```

Lee `MONGODB_URI` y `MONGODB_DB` del `.env` (bun lo carga solo). Si Mongo no
está levantado, el script espera 5 segundos y aborta.

## En producción (Coolify)

En Coolify: la aplicación → pestaña **Terminal** → el contenedor de la app. Ya
estás en `/app` y las variables de la aplicación están en el entorno, así que es
el mismo comando:

```bash
bun run create:user pepe --password "una contraseña larga"
```

Funciona porque la imagen copia `scripts/` y los tres módulos que importa. Si
alguna vez falla con un error de import, es que se añadió un import nuevo al
script y hay que añadir su `COPY` al `Dockerfile` (ver `AGENTS.md`, §8).

Desde el host, sin pasar por la interfaz:

```bash
docker exec -it <contenedor> bun run create:user pepe --password "…"
```

## Las reglas

| Campo      | Límite                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Usuario    | 3 a 20 caracteres: letras, números, `.`, `_` o `-`.                    |
| Contraseña | Mínimo 8 caracteres, máximo 200. Se guarda con scrypt, nunca en claro. |
| Nombre     | Opcional, hasta 60 caracteres.                                         |

El usuario es **único sin importar las mayúsculas** (`Pepe` y `pepe` son el
mismo), y para iniciar sesión da igual cómo lo escribas.

## Sin dejar la contraseña en el historial

`prompt` hace eco de lo que escribes, así que teclearla no la esconde. Para que
no quede en el historial de la terminal, pásala por el entorno:

```bash
OURSONGS_PASSWORD="una contraseña larga" bun run create:user pepe
```

En PowerShell el prefijo no existe: `$env:OURSONGS_PASSWORD = "…"` y luego el
comando (el terminal de Coolify es bash, ahí sirve la primera forma).

## Cambiar una contraseña

Sin `--reset` el script se niega a tocar un usuario que ya existe:

```
✗ El usuario "pepe" ya existe. Usa --reset para cambiarle la contraseña.
```

Con `--reset` la cambia **y borra todas las sesiones de ese usuario**: quien
estuviera dentro con la contraseña vieja se queda fuera en la siguiente
petición. También se puede aprovechar para corregir el nombre:

```bash
bun run create:user pepe --password "otra contraseña" --name "Pepe Pérez" --reset
```

No hay forma de recuperar la contraseña olvidada de nadie, solo de sustituirla:
lo guardado es un hash.

## Errores y qué significan

| Mensaje                                          | Qué pasó                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `MONGODB_URI no está definida`                   | Falta el `.env` en local, o la variable en la aplicación de Coolify. |
| `Nombre de usuario inválido`                     | No cumple el formato de arriba: no admite espacios ni acentos.       |
| `La contraseña debe tener al menos 8 caracteres` | Eso, o llegó vacía porque `--password` se quedó sin valor.           |
| `El usuario "…" ya existe`                       | Querías cambiar la contraseña: añade `--reset`.                      |
| Timeout de selección de servidor                 | El contenedor no alcanza Mongo: revisa la URI, la red y el firewall. |

Cualquier fallo sale como `✗ mensaje` y termina con código 1, así que se puede
encadenar en un script.

## Comprobar que quedó

Entra en `/login` con el usuario y la contraseña. O, con acceso a la base:

```bash
mongosh "$MONGODB_URI" --eval 'db.getSiblingDB("oursongs").users.find({}, { username: 1, name: 1 })'
```

## Dar de baja a alguien

No hay script (aún), se hace en la base. Borra el usuario **y sus sesiones**, o
seguirá dentro hasta que la cookie caduque:

```js
const app = db.getSiblingDB('oursongs');
const user = app.users.findOne({ username: 'pepe' });
app.sessions.deleteMany({ userId: user._id });
app.users.deleteOne({ _id: user._id });
```

Sus canciones no se tocan: el repertorio es compartido y nadie es dueño de nada.
Cada canción guarda `createdBy`/`updatedBy` con el id del usuario, que queda
apuntando a alguien que ya no existe; hoy no se muestra en ninguna pantalla, así
que no rompe nada.

## Lo que hace por dentro

1. Valida usuario, contraseña y nombre con los mismos límites que la API
   (`src/lib/validation.ts`), para que no entre por aquí lo que la app rechaza.
2. Crea el índice único de `username` si no existe, así que funciona contra una
   base nueva donde la app nunca ha arrancado.
3. Hashea con scrypt (`src/lib/server/password.ts`) e inserta en `users`.
