# Diseño: tablaturas gráficas sencillas

## Objetivo

Permitir guardar varias tablaturas independientes en una canción. Cada tablatura
tiene un nombre y una cuadrícula visual de seis cuerdas con números de traste.
La edición se hace directamente en la cuadrícula: no hay importación ni pegado
de un formato especial.

Las tablaturas no se asocian con la letra ni con los acordes. No se selecciona
instrumento y no se modelan ritmo, duración, compás, afinación, digitaciones ni
técnicas. La experiencia toma de Songsterr solo la edición gráfica por cuerda,
la escritura de números y la navegación por teclado; no añade reproducción ni
sincronización con audio.

## Modelo de datos

Cada canción tendrá `tabs`, una lista que puede estar vacía. Cada tablatura
contendrá un id estable, un nombre y notas ubicadas en una cuadrícula común de
seis cuerdas:

```ts
interface SongTab {
	id: string;
	name: string;
	notes: TabNote[];
}

interface TabNote {
	string: number; // 0 es la cuerda superior; 5, la inferior
	column: number; // posición horizontal, empezando en 0
	fret: number; // número de traste entre 0 y 99
}
```

Las notas se guardan de forma dispersa: las posiciones vacías no se serializan,
pero las filas comparten columnas para que varios números queden alineados. Una
posición admite como máximo un número. `0` representa una cuerda al aire; `1` a
`99` son trastes. Los IDs de tablatura son UUID, únicos dentro de la canción, y
los nombres no pueden repetirse ignorando mayúsculas y espacios exteriores.

Límites iniciales: 20 tablaturas por canción, 1.000 notas por canción, 1.000
columnas por tablatura y 60 caracteres por nombre. La API mantiene además su
límite general de 64 KB por petición. Las canciones ya guardadas que no tengan
el campo se leen con `tabs: []`; no hace falta una migración de MongoDB.

## Interacción de edición

La tablatura se muestra como seis líneas horizontales con celdas seleccionables.
Se pueden añadir, renombrar y eliminar tablaturas, y editar sus notas desde el
formulario de canción. No se muestran nombres de instrumento ni de afinación en
las líneas.

- Un clic selecciona la cuerda y columna; hacer clic en el espacio al final de
  una fila selecciona la siguiente columna disponible.
- Al escribir un dígito se inicia una entrada breve. Si se escribe otro dígito
  antes de que venza el plazo, ambos forman un número de dos cifras; si no, se
  confirma el primer dígito. Se asume una pausa de 500 ms.
- Al vencer la pausa, el número se confirma y el cursor avanza una columna a la
  derecha en la misma cuerda. Si se escribe una segunda cifra, la pausa empieza
  de nuevo. Si el número ocupa la última columna visible, la cuadrícula se amplía.
- Las flechas izquierda y derecha cambian de columna; arriba y abajo cambian de
  cuerda. Si hay una cifra pendiente, se confirma antes de mover el cursor, sin
  aplicar además el avance automático.
- `Backspace` y `Delete` borran la nota seleccionada. Si no hay nota, no alteran
  otras posiciones.

No se ofrece pegar/importar tablaturas desde texto, portapapeles ni formatos de
otros sitios. Tampoco se acepta escritura de símbolos: solo dígitos para los
trastes y las teclas de navegación/edición indicadas.

## Lectura de la canción

La ficha muestra las tablaturas en una sección separada de la letra y los
acordes. Cada una aparece bajo su nombre como seis líneas horizontales, con los
números en sus columnas. Si una canción no tiene tablaturas, no se reserva un
bloque vacío ni se altera la presentación actual de letra y acordes.

Las columnas se desplazan horizontalmente en pantallas estrechas; no se
reenvuelven porque eso rompería la alineación vertical. La ficha conserva la
acción de edición existente y no necesita una ruta independiente para alinear.

## Persistencia, validación y modo sin conexión

`tabs` forma parte del DTO de `Song` y de `SongInput`, del documento Mongo y de
las operaciones existentes de crear y actualizar canción. El servidor valida
la lista completa: estructura, límites, UUIDs únicos, nombres no repetidos,
coordenadas enteras dentro de rango, números entre 0 y 99 y ausencia de dos
notas en la misma celda. Los fallos corregibles producen `ValidationError` con
mensajes en español.

El resumen de canciones no incluye las tablaturas, para no cargar datos de
edición al listar el repertorio. Las cargas de detalle y de canciones sin
conexión sí incluyen `tabs`. La cola de canciones creadas sin conexión conserva
el campo y lo sube junto con el resto de la canción; no se permite editar
canciones existentes sin conexión, de acuerdo con las reglas actuales.

La forma actual de IndexedDB guarda objetos completos, así que añadir `tabs` no
requiere cambiar la versión del almacén. El respaldo local usa `[]` cuando el
campo falte.

## Impresión

La hoja imprimible incluye las tablaturas después del contenido de acordes y
letra, cada una con su nombre y las seis líneas alineadas. Las líneas largas se
parten por columnas completas, sin separar una cifra de su celda ni desalinear
las cuerdas. Una canción sin tablaturas se imprime igual que hoy.

## Componentes y responsabilidades

- `src/lib/types.ts`: DTOs de tablatura y notas.
- `src/lib/validation.ts`: topes compartidos de nombres, tablaturas, columnas,
  notas y trastes.
- `src/lib/server/songs.ts`: normalización y serialización de `tabs`.
- `src/lib/offline/logic.ts`: persistencia de tablaturas en canciones pendientes
  y representación local.
- `src/lib/components/SongForm.svelte`: nombre, alta/baja y edición de varias
  tablaturas dentro del flujo actual.
- Un componente de cuadrícula reutilizable para edición y lectura, con estilos
  de impresión adaptados para la hoja.
- `src/routes/canciones/[id]/+page.svelte`: sección de lectura de tablaturas.
- `src/lib/components/PrintSheet.svelte` y la lógica de impresión: salida
  imprimible.

La interfaz reutiliza la paleta monocroma, los tokens de tema y las clases
existentes. Todo el texto visible, incluidos errores y botones, va en español;
los identificadores y nombres de campos van en inglés.

## Fuera de alcance

- Elegir instrumento, cantidad de cuerdas o afinación.
- Ritmos, silencios, compases, duración o figuras musicales.
- Símbolos, técnicas, acordes, letra alineada, reproducción o audio.
- Importar, pegar o convertir formatos de tablatura.
- Edición de canciones sin conexión.

## Verificación prevista

La lógica pura cubrirá normalización, validación de rangos, duplicados, nombres,
y edición de posiciones. La interfaz se revisará con escritura de trastes de una
y dos cifras, pausa de confirmación, movimiento entre las seis cuerdas,
expansión horizontal, múltiples tablaturas, temas claro/oscuro, móvil, impresión
y creación sin conexión. Antes de darlo por terminado se aplicarán los comandos
de formato, lint, chequeo de tipos, pruebas y build indicados por `AGENTS.md`.
