# Alineación visual de acordes con la letra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar un catálogo de acordes y colocar visualmente cada aparición en cualquier posición de la letra, conservando la transposición en la vista integrada.

**Architecture:** La canción guarda definiciones de acordes con IDs estables y apariciones referenciadas por `chordId` y offset de texto. La manipulación de offsets, grafemas y filas visuales vive en un módulo puro; Mongo valida y persiste el conjunto completo, mientras dos componentes separados se encargan de alinear y leer/transponer.

**Tech Stack:** Bun, SvelteKit 2, Svelte 5 runes, TypeScript estricto, MongoDB 6, CSS/Tailwind 4 y `bun:test`.

**Spec:** `docs/superpowers/specs/2026-09-24-alineacion-acordes-letra-design.md`

## Global Constraints

- Todo texto visible, ruta y mensaje de error va en español; identificadores y archivos van en inglés.
- `mongodb` se mantiene en `^6`; verificar su importación directa con Bun.
- Las fechas siguen formateándose en el servidor.
- No introducir dependencias: usar `crypto.randomUUID()` e `Intl.Segmenter` disponibles en la plataforma.
- El catálogo no tiene orden musical, pero el array conserva un orden estable de presentación.
- La transposición solo afecta la vista; nunca modifica acordes ni offsets persistidos.
- La UI usa exclusivamente la paleta monocroma y las clases de `src/routes/layout.css`.
- Mantener el cuerpo JSON máximo en 64 KB y añadir un límite explícito de 2.000 apariciones.
- No modificar ni incluir en commits los cambios locales preexistentes de `README.md` o `AGENTS.md`.
- Antes de terminar: `bun run format`, `bun run lint`, `bun run check`, `bun test` y `bun run build`, sin errores ni avisos.

## Review Focus

- Ediciones junto a saltos de línea y al final del texto deben mantener offsets válidos; Task 1 incluye pruebas de inserción, reemplazo y borrado en esos límites.
- Emojis y caracteres combinados no deben ofrecer puntos de inserción internos; Task 1 prueba segmentación por grafemas y conversión a offsets UTF-16.
- Renombrar conserva IDs y apariciones, mientras borrar un acorde asignado exige enviar las apariciones actualizadas; Task 2 prueba ambos casos.
- Dos acordes en el mismo offset o un `chordId` inexistente deben producir un 400 claro; Task 2 fija ambos errores.
- Acordes muy próximos o más largos que la letra no deben solaparse ni cortar el desplazamiento horizontal; Tasks 1 y 6 prueban la distribución por filas y ancho mínimo.

---

### Task 1: Modelo puro de posiciones y distribución

**Files:**

- Create: `src/lib/music/chordPlacements.ts`
- Create: `tests/chordPlacements.test.mjs`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/validation.ts`

**Interfaces:**

- Consumes: the structural `ChordPlacement` DTO defined in this task; keep the module free of SvelteKit and MongoDB.
- Produces: `splitGraphemes`, `splitLyricLines`, `remapPlacements`, `upsertPlacement`, `removePlacementsForChord`, `placementsForLine`, and `packChordRows`.

- [ ] **Step 1: Define the shared chord and appearance DTOs**

```ts
export interface SongChord {
	id: string;
	value: string;
}

export interface SongChordInput {
	id?: unknown;
	value?: unknown;
}

export interface ChordPlacement {
	chordId: string;
	offset: number;
}
```

Add `MAX_CHORD_PLACEMENTS_PER_SONG = 2_000` to `src/lib/validation.ts`.

- [ ] **Step 2: Add failing tests for graphemes and lyric lines**

```js
import { describe, expect, test } from 'bun:test';
import {
	packChordRows,
	placementsForLine,
	remapPlacements,
	removePlacementsForChord,
	splitGraphemes,
	splitLyricLines,
	upsertPlacement
} from '../src/lib/music/chordPlacements.ts';

describe('posiciones visuales', () => {
	test('no parte grafemas compuestos', () => {
		expect(splitGraphemes('a🎵e\u0301').map(({ text, offset }) => [text, offset])).toEqual([
			['a', 0],
			['🎵', 1],
			['é', 3]
		]);
	});

	test('conserva líneas vacías y offsets globales', () => {
		expect(splitLyricLines('uno\n\ntres')).toEqual([
			{ text: 'uno', start: 0, end: 3 },
			{ text: '', start: 4, end: 4 },
			{ text: 'tres', start: 5, end: 9 }
		]);
	});
});
```

- [ ] **Step 3: Run the new test and verify the module is missing**

Run: `bun test tests/chordPlacements.test.mjs`

Expected: FAIL because `src/lib/music/chordPlacements.ts` does not exist.

- [ ] **Step 4: Implement grapheme and line primitives**

```ts
export interface GraphemePart {
	text: string;
	offset: number;
	end: number;
}

export interface LyricLine {
	text: string;
	start: number;
	end: number;
}

const graphemeSegmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });

export function splitGraphemes(text: string): GraphemePart[] {
	return [...graphemeSegmenter.segment(text)].map(({ segment, index }) => ({
		text: segment,
		offset: index,
		end: index + segment.length
	}));
}

export function splitLyricLines(lyrics: string): LyricLine[] {
	const lines: LyricLine[] = [];
	let start = 0;
	for (const text of lyrics.split('\n')) {
		lines.push({ text, start, end: start + text.length });
		start += text.length + 1;
	}
	return lines;
}
```

- [ ] **Step 5: Add failing tests for remapping, replacement, deletion and line boundaries**

```js
test('desplaza lo posterior a una inserción', () => {
	const result = remapPlacements('hola mundo', 'hola gran mundo', [
		{ chordId: 'a', offset: 0 },
		{ chordId: 'b', offset: 5 }
	]);
	expect(result).toEqual({
		placements: [
			{ chordId: 'a', offset: 0 },
			{ chordId: 'b', offset: 10 }
		],
		needsReview: false
	});
});

test('marca lo que estaba dentro de texto reemplazado', () => {
	const result = remapPlacements('abc\ndef', 'aX\ndef', [{ chordId: 'a', offset: 2 }]);
	expect(result.placements).toEqual([{ chordId: 'a', offset: 2 }]);
	expect(result.needsReview).toBe(true);
});

test('mantiene válido un acorde al final después de borrar', () => {
	const result = remapPlacements('abc', 'a', [{ chordId: 'a', offset: 3 }]);
	expect(result.placements).toEqual([{ chordId: 'a', offset: 1 }]);
	expect(result.needsReview).toBe(false);
});
```

- [ ] **Step 6: Implement remapping as one contiguous edit per input event**

```ts
export interface PlacementRemapResult {
	placements: ChordPlacement[];
	needsReview: boolean;
}

export function remapPlacements(
	before: string,
	after: string,
	placements: ChordPlacement[]
): PlacementRemapResult {
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;

	let beforeEnd = before.length;
	let afterEnd = after.length;
	while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
		beforeEnd--;
		afterEnd--;
	}

	const delta = afterEnd - beforeEnd;
	let needsReview = false;
	const next = placements.map((placement) => {
		if (placement.offset <= start) return placement;
		if (placement.offset >= beforeEnd) {
			return { ...placement, offset: placement.offset + delta };
		}
		needsReview = true;
		const leftDistance = placement.offset - start;
		const rightDistance = beforeEnd - placement.offset;
		return { ...placement, offset: leftDistance < rightDistance ? start : afterEnd };
	});

	return { placements: dedupePlacements(next), needsReview };
}
```

Implementation note: `before === after` returns a shallow copy with `needsReview: false`; clamp every result to `[0, after.length]`. Treat an insertion (`beforeEnd === start`) as shifting offsets strictly after the insertion, so an anchor at the insertion point stays before the inserted text.

- [ ] **Step 7: Add failing tests for placement mutations and row packing**

```js
test('reemplaza el acorde que ocupa el mismo offset', () => {
	expect(upsertPlacement([{ chordId: 'a', offset: 4 }], { chordId: 'b', offset: 4 })).toEqual([
		{ chordId: 'b', offset: 4 }
	]);
});

test('elimina todas las apariciones de un acorde', () => {
	expect(
		removePlacementsForChord(
			[
				{ chordId: 'a', offset: 0 },
				{ chordId: 'b', offset: 4 },
				{ chordId: 'a', offset: 8 }
			],
			'a'
		)
	).toEqual([{ chordId: 'b', offset: 4 }]);
});

test('distribuye etiquetas que se solapan en filas diferentes', () => {
	const rows = packChordRows([
		{ chordId: 'a', offset: 0, column: 0, label: 'Cmaj7' },
		{ chordId: 'b', offset: 2, column: 2, label: 'Bm7' },
		{ chordId: 'c', offset: 9, column: 9, label: 'Em' }
	]);
	expect(rows.map((row) => row.map(({ chordId }) => chordId))).toEqual([['a', 'c'], ['b']]);
});
```

- [ ] **Step 8: Implement mutation, line lookup and greedy row packing helpers**

```ts
export interface PositionedChord extends ChordPlacement {
	column: number;
	label: string;
}

export function upsertPlacement(
	placements: ChordPlacement[],
	placement: ChordPlacement
): ChordPlacement[] {
	return [...placements.filter(({ offset }) => offset !== placement.offset), placement].sort(
		(a, b) => a.offset - b.offset
	);
}

export function removePlacementsForChord(
	placements: ChordPlacement[],
	chordId: string
): ChordPlacement[] {
	return placements.filter((placement) => placement.chordId !== chordId);
}
```

`placementsForLine(line, placements, chordById)` must include offsets from `line.start` through
`line.end`, convert each local UTF-16 offset to a grapheme column, and return `PositionedChord[]`.
`packChordRows(items)` sorts by column and greedily places an item in the first row whose last label
ends before its column; reserve `label.length + 1` columns to guarantee a visible gap.

- [ ] **Step 9: Run focused tests and commit**

Run: `bun test tests/chordPlacements.test.mjs`

Expected: PASS.

```bash
git add src/lib/music/chordPlacements.ts src/lib/types.ts src/lib/validation.ts tests/chordPlacements.test.mjs
git commit -m "Añade modelo puro de posiciones de acordes"
```

### Task 2: Validación del catálogo y sus apariciones

**Files:**

- Create: `src/lib/server/songChords.ts`
- Create: `tests/songChords.test.mjs`

**Interfaces:**

- Consumes: `isValidChord`, `normalizeChord`, `MAX_CHORDS_PER_SONG`, and `MAX_CHORD_PLACEMENTS_PER_SONG`.
- Produces: server functions `normalizeChordCatalog(values, current?, createId?)` and `normalizeChordPlacements(values, chords, lyrics)`.

- [ ] **Step 1: Add failing catalog tests**

```js
import { describe, expect, test } from 'bun:test';
import { normalizeChordCatalog, normalizeChordPlacements } from '../src/lib/server/songChords.ts';

describe('catálogo de acordes', () => {
	test('crea IDs y normaliza acordes nuevos', () => {
		let next = 0;
		expect(
			normalizeChordCatalog([{ value: 'am7' }, { value: 'F♯m' }], [], () => `id-${++next}`)
		).toEqual([
			{ id: 'id-1', value: 'Am7' },
			{ id: 'id-2', value: 'F#m' }
		]);
	});

	test('conserva el ID al renombrar', () => {
		expect(
			normalizeChordCatalog([{ id: 'keep', value: 'Cmaj9' }], [{ id: 'keep', value: 'Cmaj7' }])
		).toEqual([{ id: 'keep', value: 'Cmaj9' }]);
	});

	test('rechaza acordes normalizados duplicados', () => {
		expect(() => normalizeChordCatalog([{ value: 'am' }, { value: 'Am' }])).toThrow(
			'El catálogo no puede repetir acordes'
		);
	});
});
```

- [ ] **Step 2: Run the catalog tests and verify failure**

Run: `bun test tests/songChords.test.mjs`

Expected: FAIL because `songChords.ts` and the DTOs do not exist.

- [ ] **Step 3: Implement catalog normalization**

```ts
import { randomUUID } from 'node:crypto';
import { isValidChord, normalizeChord } from '../music/chords';
import { MAX_CHORDS_PER_SONG, MAX_CHORD_PLACEMENTS_PER_SONG } from '../validation';
import { ValidationError } from './errors';
import type { ChordPlacement, SongChord } from '../types';

export function normalizeChordCatalog(
	values: unknown,
	current: SongChord[] = [],
	createId: () => string = randomUUID
): SongChord[] {
	if (values === undefined || values === null) return [];
	if (!Array.isArray(values)) throw new ValidationError('Los acordes deben venir en una lista');
	if (values.length > MAX_CHORDS_PER_SONG) {
		throw new ValidationError(`No se pueden registrar más de ${MAX_CHORDS_PER_SONG} acordes`);
	}
	// Validar objeto, ID existente, valor musical y duplicados antes de devolver.
}
```

The finished function must reject an incoming ID not found in `current`, repeated IDs, empty/invalid
values and duplicated normalized values. New IDs come only from `createId`.

- [ ] **Step 4: Add failing appearance validation tests**

```js
const chords = [
	{ id: 'c', value: 'C' },
	{ id: 'g', value: 'G' }
];

test('ordena y acepta posiciones límite', () => {
	expect(
		normalizeChordPlacements(
			[
				{ chordId: 'g', offset: 4 },
				{ chordId: 'c', offset: 0 }
			],
			chords,
			'hola'
		)
	).toEqual([
		{ chordId: 'c', offset: 0 },
		{ chordId: 'g', offset: 4 }
	]);
});

test('rechaza IDs desconocidos y offsets repetidos', () => {
	expect(() => normalizeChordPlacements([{ chordId: 'x', offset: 0 }], chords, 'hola')).toThrow(
		'El acorde asignado ya no existe'
	);
	expect(() =>
		normalizeChordPlacements(
			[
				{ chordId: 'c', offset: 2 },
				{ chordId: 'g', offset: 2 }
			],
			chords,
			'hola'
		)
	).toThrow('Solo puede haber un acorde en cada posición');
});

test('rechaza una posición que parte un grafema', () => {
	expect(() => normalizeChordPlacements([{ chordId: 'c', offset: 2 }], chords, 'a🎵b')).toThrow(
		'La posición del acorde no es válida'
	);
});
```

- [ ] **Step 5: Implement appearance normalization**

```ts
export function normalizeChordPlacements(
	values: unknown,
	chords: SongChord[],
	lyrics: string
): ChordPlacement[] {
	if (values === undefined || values === null) return [];
	if (!Array.isArray(values)) throw new ValidationError('Las posiciones deben venir en una lista');
	if (values.length > MAX_CHORD_PLACEMENTS_PER_SONG) {
		throw new ValidationError(
			`No se pueden colocar más de ${MAX_CHORD_PLACEMENTS_PER_SONG} acordes`
		);
	}
	// Validar objetos, IDs, enteros, rango, límites de grafema y offsets únicos.
}
```

Build the valid-offset set from `splitGraphemes(lyrics)` plus `lyrics.length`, sort by offset, and
return new objects so no untrusted reference crosses into MongoDB.

- [ ] **Step 6: Run focused tests and commit**

Run: `bun test tests/songChords.test.mjs tests/chordPlacements.test.mjs`

Expected: PASS.

```bash
git add src/lib/server/songChords.ts tests/songChords.test.mjs
git commit -m "Valida catálogos y posiciones de acordes"
```

### Task 3: Persistencia atómica y contrato de la canción

**Files:**

- Modify: `src/lib/server/songs.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/routes/api/songs/+server.ts`
- Modify: `src/routes/api/songs/[id]/+server.ts`

**Interfaces:**

- Consumes: `normalizeChordCatalog` and `normalizeChordPlacements` from Task 2.
- Produces: `SongSummary` with `SongChord[]`, full `Song` with `ChordPlacement[]`, and `createSong`/`updateSong` enforcing all cross-field invariants.

- [ ] **Step 1: Change document and DTO mapping types**

```ts
export interface SongDoc {
	// campos existentes
	chords: SongChord[];
	chordPlacements: ChordPlacement[];
}

export interface SongSummary {
	// campos existentes
	chords: SongChord[];
}

export interface Song extends SongSummary {
	// campos existentes de detalle
	chordPlacements: ChordPlacement[];
}
```

Update `SUMMARY_PROJECTION` and `toSongSummary` for the new chord objects, but do not include
`chordPlacements` in list queries: a song can have 2,000 and the list does not use them. `toSong`
copies appearances as plain DTO values. Do not expose Mongo types or dates.

- [ ] **Step 2: Make creation validate the complete new shape**

```ts
const lyrics = normalizeLyrics(input.lyrics);
const chords = normalizeChordCatalog(input.chords);
const chordPlacements = normalizeChordPlacements(input.chordPlacements, chords, lyrics);
const doc = {
	title: normalizeTitle(input.title),
	...(artist && { artist }),
	lyrics,
	chords,
	chordPlacements
	// auditoría existente
} as SongDoc;
```

Extend `SongInput` with `chordPlacements?: unknown`. Creating without placements yields `[]`.

- [ ] **Step 3: Make partial updates resolve fields against the current document**

Fetch the current `SongDoc` first and return `NotFoundError` when absent. Calculate:

```ts
const lyrics = patch.lyrics === undefined ? current.lyrics : normalizeLyrics(patch.lyrics);
const chords =
	patch.chords === undefined ? current.chords : normalizeChordCatalog(patch.chords, current.chords);
const chordPlacements =
	patch.chordPlacements === undefined
		? current.chordPlacements
		: normalizeChordPlacements(patch.chordPlacements, chords, lyrics);
```

If changing `lyrics` or `chords` would invalidate unchanged placements, throw
`ValidationError('Actualiza también la alineación de los acordes')`. Persist all supplied dependent
fields in the same `$set`, together with `updatedAt` and `updatedBy`.

- [ ] **Step 4: Update every server consumer of `song.chords`**

Search: `rg -n "\.chords|chords:" src -g '*.ts' -g '*.svelte'`

At this task only, make TypeScript consumers compile by using `.value` where a musical string is
required. Leave UI redesign to Tasks 4–6.

- [ ] **Step 5: Run server-oriented verification**

Run: `bun test`

Expected: all musical and new normalization tests pass.

Run: `bun run check`

Expected: 0 errors and 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/songs.ts src/lib/types.ts src/routes/api/songs/+server.ts src/routes/api/songs/[id]/+server.ts
git commit -m "Guarda acordes identificados y su alineación"
```

### Task 4: Catálogo editable y conservación al cambiar la letra

**Files:**

- Create: `src/lib/components/ChordCatalogEditor.svelte`
- Modify: `src/lib/components/SongForm.svelte`
- Modify: `src/lib/components/Icon.svelte` only if the editor needs an existing semantic action without an icon.

**Interfaces:**

- Consumes: `SongChord`, `ChordPlacement`, `remapPlacements`, `removePlacementsForChord`, `isValidChord`.
- Produces: a bindable `SongChordInput[]` catalog and a `SongForm` payload that always keeps `lyrics`, `chords`, and `chordPlacements` consistent.

- [ ] **Step 1: Create the catalog editor with add, rename and delete states**

`ChordCatalogEditor.svelte` receives:

```ts
interface Props {
	chords: SongChordInput[];
	assignedIds: string[];
	disabled?: boolean;
	onDeleteRequested: (chord: SongChordInput) => void;
}
let { chords = $bindable(), assignedIds, disabled = false, onDeleteRequested }: Props = $props();
```

The component uses one input plus an `Añadir` button, renders every definition as an editable chip,
normalizes only for validation preview and never invents persistent IDs. It displays invalid and
duplicate values in Spanish. For an unassigned definition it deletes immediately; for an assigned
one it calls `onDeleteRequested` and lets `SongForm` own the confirmation.

- [ ] **Step 2: Replace the progression text field in `SongForm`**

Initialize state without tracking future prop changes:

```ts
let chords = $state<SongChordInput[]>(
	untrack(() => song?.chords.map((chord) => ({ ...chord })) ?? [])
);
let chordPlacements = $state<ChordPlacement[]>(
	untrack(() => song?.chordPlacements.map((placement) => ({ ...placement })) ?? [])
);
let placementsNeedReview = $state(false);
```

Replace the current `chordsText`, `chordsFromText` preview and invalid derivation with
`ChordCatalogEditor`. Keep validation feedback before sending the request.

- [ ] **Step 3: Remap placements on every textarea input**

Do not use `bind:value` for lyrics. Use the current state as the previous value:

```ts
function updateLyrics(event: Event) {
	const nextLyrics = (event.currentTarget as HTMLTextAreaElement).value;
	const remapped = remapPlacements(lyrics, nextLyrics, chordPlacements);
	lyrics = nextLyrics;
	chordPlacements = remapped.placements;
	placementsNeedReview ||= remapped.needsReview;
}
```

Render the textarea with `value={lyrics}` and `oninput={updateLyrics}`. When review is needed, show:
`La letra cambió alrededor de un acorde. Revisa su alineación cuando guardes.`

- [ ] **Step 4: Keep deletion explicit and payloads atomic**

When an assigned chord is removed, open the existing `ConfirmDialog` and ask:
`Este acorde ya está colocado en la letra. ¿Quieres quitar también todas sus apariciones?`
Only after confirmation call `removePlacementsForChord`. Submit:

```ts
const payload = {
	title: title.trim(),
	artist: artist.trim(),
	lyrics,
	chords,
	chordPlacements,
	tagIds: selectedTagIds
};
```

- [ ] **Step 5: Format, type-check and commit**

Run: `bun run format`

Run: `bun run lint`

Expected: formatting check and ESLint pass.

Run: `bun run check`

Expected: 0 errors and 0 warnings.

```bash
git add src/lib/components/ChordCatalogEditor.svelte src/lib/components/SongForm.svelte src/lib/components/Icon.svelte
git commit -m "Convierte los acordes en un catálogo editable"
```

### Task 5: Editor visual de alineación

**Files:**

- Create: `src/lib/components/ChordAlignmentEditor.svelte`
- Create: `src/routes/canciones/[id]/alinear/+page.server.ts`
- Create: `src/routes/canciones/[id]/alinear/+page.svelte`
- Modify: `src/routes/canciones/[id]/+page.svelte`

**Interfaces:**

- Consumes: `splitGraphemes`, `splitLyricLines`, `upsertPlacement`, `placementsForLine`, `Song`, and `jsonRequest`.
- Produces: a private Spanish route that saves `{ chordPlacements }` through the existing PATCH endpoint.

- [ ] **Step 1: Add the protected page loader**

```ts
import { error } from '@sveltejs/kit';
import { getSong } from '$lib/server/songs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const song = await getSong(params.id);
	if (!song) throw error(404, 'Esa canción no existe');
	return { song };
};
```

No change to `PUBLIC_ROUTES`: the editor remains private.

- [ ] **Step 2: Build the visual editor interaction**

`ChordAlignmentEditor.svelte` accepts `song`, `onSaved` and `onCancel`. Copy placements into local
state. Render a sticky palette of chord buttons and one horizontally scrollable block per logical
line. Split each line into grapheme buttons with `tabindex="-1"`; clicking a button selects the global
offset before it, and an end button selects `line.end`.

The selected offset must have a visible caret and a text label such as `Posición 14`. Clicking a
palette chord calls:

```ts
placements = upsertPlacement(placements, { chordId: chord.id, offset: selectedOffset });
```

Clicking an existing occurrence selects it. The action bar provides `Mover a la izquierda`, `Mover a
la derecha` and `Quitar`, moving only across values returned by `splitGraphemes(song.lyrics)` plus the
end offset.

- [ ] **Step 3: Add save, error and empty states**

Save with:

```ts
await jsonRequest<Song>(`/api/songs/${song.id}`, 'PATCH', { chordPlacements: placements });
```

Disable duplicate submissions. Translate `ClientApiError` into its Spanish message. If `lyrics` is
empty, say `Añade la letra antes de alinear acordes`; if `chords` is empty, say
`Registra los acordes antes de alinearlos`, with a link back to the song detail.

- [ ] **Step 4: Create the route page and entry action**

The page renders a back link using `resolve('/canciones/[id]', { id })`, `PageHeader`, and the editor.
After saving, navigate to the detail with `goto(resolve(...), { invalidateAll: true })`. Add an
`Alinear acordes` button to the detail header using the typed route:

```ts
resolve('/canciones/[id]/alinear', { id: data.song.id });
```

- [ ] **Step 5: Verify keyboard, touch sizing and Svelte rules**

Every chord palette/action button must be at least 44 px high through `.btn`, `.chip`, or
`.icon-btn`. The line itself keeps `white-space: pre`, does not wrap, and scrolls horizontally. Avoid
native mutable `Map`, `Set`, `URL` or `URLSearchParams` inside the component.

Run: `bun run lint`

Run: `bun run check`

Expected: both pass with 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ChordAlignmentEditor.svelte src/routes/canciones/[id]/alinear src/routes/canciones/[id]/+page.svelte
git commit -m "Añade editor visual para alinear acordes"
```

### Task 6: Letra integrada con transposición

**Files:**

- Create: `src/lib/components/TransposeControls.svelte`
- Create: `src/lib/components/ChordLyrics.svelte`
- Modify: `src/lib/components/ChordBoard.svelte` or delete it if no consumer remains.
- Modify: `src/routes/canciones/[id]/+page.svelte`
- Modify: `tests/chordPlacements.test.mjs`

**Interfaces:**

- Consumes: `placementsForLine`, `packChordRows`, `splitLyricLines`, `resolveSpelling`, `transposeChord`, and `wrapSemitones`.
- Produces: `ChordLyrics` as the only song-detail presentation of lyrics and chord occurrences; `TransposeControls` encapsulates the current controls.

- [ ] **Step 1: Extend row-layout tests for width and distant labels**

```js
test('mantiene en una fila acordes que tienen separación suficiente', () => {
	const rows = packChordRows([
		{ chordId: 'a', offset: 0, column: 0, label: 'C' },
		{ chordId: 'b', offset: 8, column: 8, label: 'G#m7' }
	]);
	expect(rows).toHaveLength(1);
	expect(rows[0].map(({ column }) => column)).toEqual([0, 8]);
});

test('el ancho visual incluye un acorde posterior al final de una línea vacía', () => {
	const rows = packChordRows([{ chordId: 'a', offset: 0, column: 0, label: 'Cmaj7' }]);
	expect(rows[0][0].column + rows[0][0].label.length).toBe(5);
});
```

- [ ] **Step 2: Extract transposition controls without changing behavior**

`TransposeControls.svelte` binds `semitones` and `accidentals`:

```ts
interface Props {
	semitones: number;
	accidentals: Accidentals;
	chords: string[];
}
let { semitones = $bindable(), accidentals = $bindable(), chords }: Props = $props();
```

Move the sharp/flat buttons, down/up/reset controls and `aria-live` label from `ChordBoard`. Keep
`wrapSemitones`, `formatSemitones`, labels and disabled reset behavior unchanged.

- [ ] **Step 3: Build `ChordLyrics`**

Maintain local transposition state:

```ts
let semitones = $state(0);
let accidentals = $state<Accidentals>('auto');
const chordValues = $derived(chords.map(({ value }) => value));
const spelling = $derived(resolveSpelling(chordValues, accidentals));
const shownById = $derived(
	new SvelteMap(chords.map((chord) => [chord.id, transposeChord(chord.value, semitones, spelling)]))
);
```

Import `SvelteMap` from `svelte/reactivity` to satisfy the strict rule. For each lyric line, obtain
positioned occurrences with transposed labels, call `packChordRows`, and render every row and the
text on the same character grid. Set the scrollable content's `min-width` to the maximum of the lyric
grapheme count and each `column + label.length`, expressed in `ch`.

When there are no appearances, render the lyrics unchanged and the link `Alinear acordes`. When
there is no lyric, keep the existing invitation to edit it.

- [ ] **Step 4: Replace separate sections in the detail page**

Remove the old `ChordBoard` plus standalone `<pre class="lyrics">`. Render:

```svelte
<ChordLyrics
	lyrics={data.song.lyrics}
	chords={data.song.chords}
	placements={data.song.chordPlacements}
	songId={data.song.id}
/>
```

Keep the tags, metadata, editing and deletion flows unchanged. Remove dead CSS and delete
`ChordBoard.svelte` only after `rg -n "ChordBoard" src` reports no remaining consumer.

- [ ] **Step 5: Run focused and static verification**

Run: `bun test tests/chords.test.mjs tests/chordPlacements.test.mjs`

Expected: PASS, including the original 27 transposition cases.

Run: `bun run lint`

Run: `bun run check`

Expected: 0 errors and 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/TransposeControls.svelte src/lib/components/ChordLyrics.svelte src/lib/components/ChordBoard.svelte src/routes/canciones/[id]/+page.svelte tests/chordPlacements.test.mjs
git commit -m "Integra acordes transponibles con la letra"
```

### Task 7: Revisión funcional y verificación de producción

**Files:**

- Modify only files implicated by failures found in this task.

**Interfaces:**

- Consumes: the completed feature from Tasks 1–6.
- Produces: a production build and a manually verified end-to-end flow.

- [ ] **Step 1: Search for stale assumptions and forbidden UI text**

Run: `rg -n "chordsFromText|chordsToText|ChordBoard|un acorde por elemento|progresión" src README.md`

Expected: no stale production-code assumption that `chords` is `string[]`; pure helpers may remain
exported and tested if they are still intentionally supported.

Run: `rg -n "href=|goto\(" src -g '*.svelte'`

Expected: all internal navigation continues to use `resolve()`.

- [ ] **Step 2: Run the required formatter and validation suite**

Run: `bun run format`

Run: `bun run lint`

Expected: 0 errors and 0 warnings.

Run: `bun run check`

Expected: 0 errors and 0 warnings.

Run: `bun test`

Expected: all original and new tests pass.

- [ ] **Step 3: Verify Bun/Mongo compatibility and production build**

Run: `bun -e "import('mongodb').then(() => console.log('ok'))"`

Expected: `ok`.

Run: `bun run build`

Expected: adapter-node production build completes successfully.

- [ ] **Step 4: Exercise the no-database HTTP behavior**

Start `bun run dev` and verify:

```bash
curl -i localhost:5173/login
curl -i localhost:5173/canciones
curl -i -X POST localhost:5173/api/songs
```

Expected: login 200; canciones 303 to `/login?redirectTo=...`; API 401 JSON. Stop the dev server.

- [ ] **Step 5: Exercise the feature with MongoDB when available**

Create a song with lyrics `Things fall apart` and catalog `Cmaj7`, `Bm7`, `Em`. Align at offsets 0,
12 and 18; rename `Bm7` to `Bm9`; confirm its occurrence remains. Insert text before offset 12 and
confirm it shifts. Transpose +1 and -1 and confirm all displayed occurrences change while a reload
at 0 shows the saved originals. Delete an assigned chord, accept the warning and verify every one of
its occurrences disappears.

If MongoDB is unavailable, record that only this database-backed manual pass could not run; the
build, route guard, API guard and pure tests remain mandatory.

- [ ] **Step 6: Inspect the final diff and commit corrections**

Run: `git diff --check`

Run: `git status --short`

Ensure only feature files plus the already committed spec/plan are included; leave the user's
preexisting `README.md` and `AGENTS.md` changes untouched.

```bash
git add -u -- src tests
git commit -m "Verifica alineación de acordes en producción"
```
