# Tablaturas gráficas sencillas — Plan de implementación

> **Para agentes implementadores:** usa `superpowers:executing-plans` para implementar este plan tarea por tarea. Mantén cada tarea revisable antes de continuar.

**Objetivo:** Añadir tablaturas gráficas independientes por canción y quitar los topes de cantidad de acordes y apariciones alineadas.

**Arquitectura:** `Song` y Mongo guardarán una lista de tablaturas con notas dispersas (`cuerda`, `columna`, `traste`). Un editor de seis cuerdas dentro de `SongForm` permitirá nombrar varias tablaturas, introducir dígitos con avance automático y navegar con flechas. La ficha y la impresión mostrarán las mismas notas en una sección separada; la cola offline conservará las tablaturas de canciones nuevas.

**Stack:** Svelte 5, TypeScript, SvelteKit, MongoDB 6, IndexedDB, Bun.

**Especificación:** `docs/superpowers/specs/2026-10-18-tablaturas-simples-design.md`

## Restricciones globales

- Una tablatura tiene seis cuerdas fijas; `string` 0 es la superior y 5 la inferior.
- `fret` admite enteros de 0 a 99. No hay topes de cantidad de tablaturas, notas, columnas ni longitud del nombre.
- Se eliminan los topes actuales de cantidad para acordes y apariciones; se mantienen la validación musical y el máximo de 24 caracteres por nombre de acorde.
- Se mantiene el límite general existente de 64 KB por petición y el límite de tamaño de documento propio de MongoDB.
- Las tablaturas no se asocian con letra ni acordes; no hay instrumento, ritmo, símbolos, importación ni pegado especial.
- Las canciones sin `tabs` se leen como `tabs: []`; los resúmenes de lista no incluyen tablaturas.
- Las canciones nuevas pendientes se guardan con sus tablaturas offline; editar canciones existentes sin conexión sigue bloqueado.
- La impresión incluye las tablaturas por nombre y conserva sus columnas al partir líneas.
- UI, errores y comentarios en español; identificadores/campos en inglés; interfaz monocroma con tokens de tema.
- La transposición existente sigue siendo solo de vista y no cambia.
- Verificación del cambio: `bun run format`, `bun run lint`, `bun run check`, `bun test` y `bun run build`. La suite fue autorizada posteriormente y pasa; no se hizo prueba manual de la interfaz.

## Focos de revisión

- Entrada de uno o dos dígitos: confirmar que la pausa de 500 ms confirma una sola cifra y que la segunda cifra no provoca dos avances.
- Navegación con una cifra pendiente: las flechas confirman la cifra y mueven exactamente una posición desde la celda seleccionada.
- Coordenadas dispersas grandes: no imponer máximos de columna/cantidad y mantener alineadas las seis cuerdas sin generar posiciones duplicadas.
- Datos antiguos y cola offline: ausencia de `tabs` debe producir `[]`; las tablaturas de una canción pendiente deben sobrevivir a la conversión y subida.
- Eliminación de topes de acordes: quitar solo los topes de cantidad, conservando duplicados inválidos, referencias rotas, validación musical y transposición.

---

### Tarea 1: Modelo, persistencia y límites de acordes

**Archivos:**

- Modificar: `src/lib/types.ts`
- Crear: `src/lib/server/songTabs.ts`
- Modificar: `src/lib/server/songs.ts`
- Modificar: `src/lib/server/songChords.ts`
- Modificar: `src/lib/validation.ts`
- Modificar: `src/lib/components/ChordCatalogEditor.svelte`
- Modificar: `src/lib/components/SongForm.svelte`
- Modificar: `src/lib/offline/db.ts`
- Modificar: `src/lib/offline/logic.ts`

**Interfaces:**

- `SongTab`: `{ id: string; name: string; notes: TabNote[] }`.
- `TabNote`: `{ string: number; column: number; fret: number }`.
- `Song.tabs` es obligatorio en el DTO; `SongInput.tabs?: unknown` permanece sin validar hasta el servidor.
- `normalizeSongTabs(values: unknown, current?: SongTab[]): SongTab[]` normaliza la lista, asigna UUIDs cuando falten y valida nombres no vacíos/no repetidos (recortados y comparados en minúsculas), UUIDs únicos, cuerda 0–5, columna entera segura no negativa, traste entero 0–99 y una nota por celda. Conserva IDs actuales; IDs nuevos deben ser UUID. No aplica topes de cantidad, columna ni largo de nombre.
- `SongDoc.tabs` es opcional para poder leer documentos ya existentes; `toSong()` lo convierte en lista y clona sus notas. `toSongSummary()` no incluye `tabs`.
- `PendingSongInput.tabs?: SongTab[]` permite leer colas offline creadas antes del cambio; `pendingToSong()` las convierte usando `[]` cuando falten. `readSong()` adapta del mismo modo las canciones guardadas en IndexedDB sin `tabs`.

- [x] Añadir los DTOs de tablatura y el campo `tabs` al tipo completo de canción y a su entrada no validada.
- [x] Implementar `normalizeSongTabs()` en `src/lib/server/songTabs.ts` con las invariantes anteriores y errores `ValidationError` en español.
- [x] Conectar la normalización a `createSong()` y `updateSong()`; devolver `tabs: []` para documentos antiguos y excluir el campo de la proyección/resumen de canciones.
- [x] Eliminar `MAX_CHORDS_PER_SONG` y `MAX_CHORD_PLACEMENTS_PER_SONG`, sus rechazos en `songChords.ts`, el guard de `ChordCatalogEditor.svelte` y la comprobación de cantidad al importar acordes pegados en `SongForm.svelte`. Mantener `MAX_CHORD_LENGTH` y el resto de validaciones.
- [x] Incluir `tabs` en `PendingSongInput` y `pendingToSong()` sin cambiar la versión ni los object stores de IndexedDB.
- [x] Ajustar `readSong()` en `src/lib/offline/db.ts` para devolver `tabs: []` cuando una copia local antigua no tenga el campo.
- [x] Revisar por lectura que no quedan usos de los dos topes de cantidad y que las notas inválidas siguen rechazándose.

### Tarea 2: Editor gráfico y formulario de canción

**Archivos:**

- Crear: `src/lib/music/tablature.ts`
- Crear: `src/lib/components/TablatureEditor.svelte`
- Modificar: `src/lib/components/SongForm.svelte`

**Interfaces:**

- `setTabNote(tab: SongTab, note: TabNote): SongTab` devuelve una tablatura nueva y reemplaza la nota si la celda ya está ocupada.
- `removeTabNote(tab: SongTab, string: number, column: number): SongTab` quita solo la celda indicada.
- `tabColumnCount(tab: SongTab, cursorColumn: number | null = 0): number` calcula columnas visibles a partir de las notas dispersas y la selección, dejando una columna vacía para continuar editando; no aplica máximo.
- `nextTabName(tabs: SongTab[]): string` devuelve el primer nombre `Tablatura N` disponible, empezando en 1.
- `TablatureEditor` recibe `tabs: SongTab[]` como `$bindable` y `disabled: boolean`; genera IDs con `createId()`, usa `nextTabName()` y expone una lista nombrable y controles para crear/quitar tablaturas.

- [x] Implementar las operaciones puras de colocar, reemplazar, quitar y medir notas en `tablature.ts`, manteniendo inmutables las entradas.
- [x] Implementar `nextTabName()` para elegir el primer nombre predeterminado disponible `Tablatura N`, incluso después de borrar o renombrar otras.
- [x] Crear `TablatureEditor.svelte` con seis filas seleccionables, celdas alineadas por columna, nombre editable, selector entre tablaturas y botones en español para añadir/eliminar. Las nuevas usan `nextTabName()` y tienen un UUID generado con `createId()` en el navegador.
- [x] Implementar buffer de dígitos con espera de 500 ms: una cifra se confirma al vencer el tiempo; una segunda cifra antes del plazo forma un único traste 10–99 y se confirma inmediatamente. En ambos casos el cursor avanza una columna a la derecha.
- [x] Implementar flechas: izquierda/derecha cambian columna, arriba/abajo cuerda dentro de 0–5 sin envolver; con una cifra pendiente, la confirman y luego hacen un solo movimiento manual sin avance automático adicional. `Backspace` y `Delete` cancelan una cifra pendiente y eliminan la celda seleccionada.
- [x] Hacer que clic seleccione una celda; al elegir el espacio final de una fila, ofrecer la siguiente columna. Si se cambia de celda o tablatura mientras hay una cifra pendiente, confirmarla en su celda original antes de mover la selección. No interceptar ni interpretar pegado como tablatura.
- [x] En `SongForm.svelte`, inicializar `tabs` con `song?.tabs ?? []`, renderizar el editor y enviar `tabs` tanto a la API como a `savePendingSong()`.
- [x] Mantener campos sin `maxlength` para el nombre de tab, bloquear nombres vacíos/duplicados antes del envío con mensajes en español y respetar `disabled` mientras se guarda.
- [x] Revisar la lógica de dígitos, la navegación en bordes de las seis cuerdas y que las notas de una celda no se dupliquen.

### Tarea 3: Lectura en la ficha e impresión

**Archivos:**

- Crear: `src/lib/components/TablatureView.svelte`
- Modificar: `src/lib/music/tablature.ts`
- Modificar: `src/routes/canciones/[id]/+page.svelte`
- Modificar: `src/lib/components/PrintSheet.svelte`

**Interfaces:**

- `TabPart`: `{ startColumn: number; columnCount: number }`.
- `splitTabColumns(tab: SongTab, columnsPerPart: number): TabPart[]` parte por columnas completas; `TablatureView` resta `startColumn` al pintar cada nota. Una tablatura vacía produce una parte de una columna, y el ancho efectivo es como mínimo una columna.
- `TablatureView` recibe `tab`, `startColumn`, `columnCount` y `printable`; filtra notas a ese tramo y presenta seis líneas sin cambiar la información musical. En pantalla se navega por ventanas acotadas y se puede saltar a una columna; en impresión se conservan los tramos dispersos y sus rangos absolutos.

- [x] Añadir `splitTabColumns()` a `tablature.ts`, calculando partes para papel sin separar notas ni desalinear cuerdas.
- [x] Crear `TablatureView.svelte` como representación de solo lectura con nombre, seis líneas y desplazamiento horizontal en pantallas estrechas.
- [x] Insertar las tablaturas después de `ChordLyrics` en la ficha, solo cuando existan; conservar todas las acciones y el estado read-only actuales.
- [x] En `PrintSheet.svelte`, generar partes de hasta `Math.max(1, Math.floor(capacity / 3))` columnas y mostrar cada tab después de letra/acordes, usando el color de texto configurado para impresión.
- [x] Revisar que la ausencia de tabs no cambie la hoja actual, que la transposición no afecte las notas y que se sigan respetando el tema y la paleta de impresión.

### Tarea 4: Formato y comprobaciones del proyecto

**Archivos:** todos los modificados en las tareas anteriores.

- [x] Ejecutar `bun run format`.
- [x] Ejecutar `bun run lint`; resolver todos los errores y avisos nuevos.
- [x] Ejecutar `bun run check`; resolver errores de TypeScript/Svelte.
- [x] Ejecutar `bun run build` porque cambian el servidor y el DTO.
- [x] Revisar el diff final: solo gris/blanco/negro en pantalla, errores en español, sin cambios en la lógica de transposición y sin los topes de cantidad eliminados.
