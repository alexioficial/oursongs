# syntax=docker/dockerfile:1

# Imagen para Coolify (build pack "Dockerfile").
#
# Variables a configurar en Coolify (todas se leen en tiempo de ejecución, con
# $env/dynamic/private, así que cambiarlas solo pide reiniciar, no reconstruir):
#   MONGODB_URI  obligatoria
#   MONGODB_DB   opcional, por defecto "oursongs"
#   ORIGIN       obligatoria, la URL pública con https:// (Traefik termina el TLS;
#                sin esto adapter-node compone mal las URLs detrás del proxy)
#   TZ           zona con la que se formatean las fechas que se muestran
#
# El contenedor escucha en el 3000 (EXPOSE); si Coolify no lo detecta solo, es el
# valor de "Ports Exposes". La imagen no define HEALTHCHECK: si quieres uno, se
# configura en Coolify apuntando a /api/health.
#
# Las cuentas se crean desde el terminal del contenedor:
#   bun run create:user pepe --password "una contraseña larga"

# ---------- Etapa 1: dependencias completas (para el build) ----------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- Etapa 2: build ----------
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ---------- Etapa 3: dependencias de producción ----------
FROM oven/bun:1 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---------- Etapa 4: runtime ----------
FROM oven/bun:1 AS runtime

# ca-certificates para el TLS de la conexión a Mongo (Atlas y cualquier
# mongodb+srv lo necesitan) y tzdata para que TZ signifique algo.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates tzdata \
	&& rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000

WORKDIR /app
RUN chown bun:bun /app
# Usuario sin privilegios que ya trae la imagen de bun (UID 1000).
USER bun

COPY --chown=bun:bun --from=prod-deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=build /app/build ./build
COPY --chown=bun:bun --from=build /app/package.json ./package.json

# Lo justo para poder ejecutar `bun run create:user` dentro del contenedor:
# el script, más los tres módulos que importa (no usa $lib ni $env a propósito).
COPY --chown=bun:bun --from=build /app/scripts ./scripts
COPY --chown=bun:bun --from=build /app/src/lib/validation.ts ./src/lib/validation.ts
COPY --chown=bun:bun --from=build /app/src/lib/server/errors.ts ./src/lib/server/errors.ts
COPY --chown=bun:bun --from=build /app/src/lib/server/password.ts ./src/lib/server/password.ts

EXPOSE 3000

CMD ["bun", "./build/index.js"]
