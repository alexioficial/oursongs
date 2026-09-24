# Diseño: acordes alineados con la letra

## Objetivo

Permitir que una canción defina primero un catálogo sin orden de los acordes que utiliza y que,
después, cada acorde pueda colocarse visualmente en cualquier posición de la letra. La ficha de la
canción debe mostrar cada aparición encima del carácter, espacio o sílaba donde entra.

La transposición existente seguirá siendo solo de presentación: subir o bajar semitonos cambia las
apariciones mostradas, pero nunca el catálogo ni las posiciones guardadas.

No hay datos anteriores que migrar. El nuevo modelo será obligatorio para todas las canciones.

## Modelo de datos

Cada canción conservará `lyrics` como un único string y reemplazará la lista de strings `chords` por
definiciones con identidad estable:

```ts
interface SongChord {
	id: string;
	value: string;
}

interface ChordPlacement {
	chordId: string;
	offset: number;
}
```

`SongDoc` y el DTO `Song` tendrán:

```ts
chords: SongChord[];
chordPlacements: ChordPlacement[];
```

El identificador permite renombrar un acorde sin perder sus apariciones. `offset` representa una
posición entre caracteres de `lyrics`, desde `0` hasta `lyrics.length`, usando los índices de string
de JavaScript de forma consistente en cliente y servidor. La UI solo permitirá elegir límites entre
grafemas, por lo que no se podrá insertar un acorde en medio de un emoji o carácter compuesto.

Invariantes:

- Los IDs de los acordes son únicos dentro de la canción.
- Los valores normalizados de los acordes también son únicos; el catálogo no tiene orden musical.
- Toda aparición referencia un acorde presente en el catálogo.
- Todo offset es un entero dentro del intervalo `[0, lyrics.length]`.
- Solo puede existir una aparición en un mismo offset. Colocar otra la reemplaza.
- Un acorde puede aparecer en tantos offsets diferentes como haga falta.
- El servidor asigna y conserva los IDs; el cliente no puede introducir identificadores arbitrarios
  al crear acordes nuevos.

## Escritura y validación

La API seguirá usando el `PATCH /api/songs/[id]` existente. Una actualización podrá enviar el
catálogo, la letra y las apariciones en una misma operación. El módulo de dominio normalizará los
acordes, resolverá sus IDs y validará las referencias antes de escribir.

Cada elemento enviado en `chords` tendrá `value` y podrá incluir el `id` de una definición existente.
El servidor comprobará que los IDs recibidos ya pertenezcan a la canción, los conservará al
renombrar y generará IDs para los elementos nuevos. Los acordes se registran antes de alinearlos, de
modo que una aparición siempre referencia un ID que el servidor ya devolvió.

El cliente pedirá confirmación antes de borrar un acorde con apariciones. Tras confirmar, retirará
el acorde y todas sus apariciones del borrador. El guardado persistirá el estado completo de forma
atómica mediante una sola actualización de MongoDB.

Se añadirá un límite compartido para la cantidad de apariciones, además del límite actual de acordes
y del cuerpo JSON de 64 KB. Las entradas inválidas producirán `ValidationError` con mensajes en
español.

## Edición de la canción

El formulario normal gestionará título, artista, catálogo de acordes, tags y letra. El catálogo se
mostrará como chips editables para que su naturaleza sin orden sea clara; se podrán añadir,
renombrar y eliminar acordes sin depender de una progresión escrita en una sola línea.

Cuando se edite una letra que ya tenga apariciones, el cliente ajustará los offsets en cada cambio:

- Las posiciones anteriores al intervalo editado permanecen iguales.
- Las posteriores se desplazan según la diferencia de longitud.
- Las situadas dentro de texto reemplazado se llevan al borde más cercano del reemplazo y quedan
  marcadas para revisión durante esa sesión.

Antes de guardar, el formulario avisará si alguna aparición necesita revisión. El usuario podrá
continuar y corregirla luego en el editor de alineación; no se perderán apariciones de forma
silenciosa.

## Editor visual de alineación

La ficha de la canción ofrecerá la acción `Alinear acordes`, que abrirá la ruta dedicada
`/canciones/[id]/alinear`, con espacio suficiente para trabajar tanto en escritorio como en móvil.

El editor tendrá tres partes:

1. Una paleta fija con todos los acordes del catálogo.
2. La letra monoespaciada, separada por sus líneas reales y sin reajuste automático.
3. Una barra de acciones para guardar, cancelar y eliminar o ajustar la aparición seleccionada.

Al pulsar entre dos caracteres se seleccionará ese offset y aparecerá un cursor visible. Pulsar un
acorde de la paleta lo colocará en el offset; si ya había otro, lo reemplazará. Pulsar una aparición
existente permitirá cambiarla, eliminarla o moverla un carácter a izquierda o derecha. Estos ajustes
finos hacen viable la colocación exacta en pantallas táctiles.

Las líneas que no quepan tendrán desplazamiento horizontal. No se envolverán, porque envolverlas
cambiaría la relación visual entre una aparición y su texto. El editor conservará espacios y líneas
vacías.

Si no hay letra o no hay acordes, la pantalla explicará qué falta y enlazará a la edición de la
canción en vez de presentar controles inutilizables.

## Lectura y transposición

La ficha sustituirá los bloques separados de acordes y letra por un componente integrado. Cada
línea lógica se renderizará con una o más filas de acordes encima y con la letra debajo. Un pequeño
algoritmo de distribución evitará que las etiquetas de acordes cercanas se solapen; cuando no quepan
en la misma fila, se colocarán en filas adicionales sin cambiar su columna de inicio.

El componente conservará los controles actuales:

- subir o bajar un semitono;
- volver al tono original;
- usar sostenidos o bemoles.

Para pintar cada aparición, resolverá su `chordId`, transpondrá el valor con la lógica pura de
`src/lib/music/chords.ts` y dejará intactos el acorde y el offset guardados. El modo automático de
sostenidos o bemoles se calculará con el catálogo completo para mantener una escritura coherente.

Una canción sin apariciones mostrará su letra normalmente y una invitación discreta a alinear los
acordes. No habrá una vista heredada de acordes separados.

## Componentes y responsabilidades

- `src/lib/types.ts`: DTOs `SongChord` y `ChordPlacement`.
- `src/lib/server/songs.ts`: normalización, IDs, invariantes y escritura atómica.
- `src/lib/music/chordPlacements.ts`: funciones puras para offsets, líneas y distribución visual.
- `SongForm.svelte`: edición del catálogo y ajuste de offsets al modificar la letra.
- Un nuevo editor de alineación: interacción de selección y colocación.
- Un nuevo componente de letra con acordes: lectura y transposición integrada.
- `ChordBoard.svelte`: se retirará o se dividirá para reutilizar únicamente sus controles de
  transposición.
- Una nueva ruta privada bajo `/canciones/[id]/...`: carga de la canción y editor visual.

La UI seguirá las clases y la paleta monocroma de `layout.css`. Todos los textos, errores y rutas
visibles estarán en español; identificadores y nombres de archivos permanecerán en inglés.

## Errores

El servidor rechazará apariciones fuera de rango, IDs desconocidos, offsets repetidos, acordes
duplicados y catálogos que excedan sus límites. Un ID de canción inexistente seguirá produciendo
404 y cualquier error inesperado continuará ocultándose tras el 500 genérico.

## Pruebas y verificación

Las funciones puras tendrán pruebas con `bun:test` para:

- offsets al principio, entre caracteres, en espacios y al final;
- saltos de línea, líneas vacías y caracteres no ASCII;
- inserciones, eliminaciones y reemplazos de letra;
- reemplazo de una aparición en el mismo offset;
- distribución de acordes cercanos en varias filas;
- renombrado y eliminación de acordes;
- transposición sin mutar valores ni posiciones.

También se comprobarán manualmente el uso con ratón y pantalla táctil, el desplazamiento de líneas
largas, el foco de teclado y los estados sin letra o sin acordes.

Antes de terminar deben pasar, en este orden operativo, `bun run format`, `bun run lint`,
`bun run check`, `bun test` y `bun run build`.
