/**
 * Importa una letra con los acordes escritos encima, que es como vienen en casi
 * cualquier cancionero o web de acordes:
 *
 *     D                    Bm
 *     Used to do it all so pure for the love of
 *
 * y también el formato en línea de ChordPro (`[D]Used to do it...`). Devuelve la
 * letra limpia y cada acorde con su offset, listo para el catálogo y la
 * alineación. Si lo pegado no parece llevar acordes devuelve null y se pega tal
 * cual.
 *
 * Es puro y sin dependencias del navegador: lo prueban los tests.
 */
import { isValidChord, MAX_CHORD_LENGTH, normalizeChord } from './chords';
import { splicePlacements, splitGraphemes, upsertPlacement } from './chordPlacements';
import type { ChordPlacement, SongChordInput } from '../types';

export interface SheetPlacement {
	/** El acorde ya normalizado ('F♯m' → 'F#m'). */
	chord: string;
	offset: number;
}

export interface ChordSheet {
	lyrics: string;
	/** Acordes distintos, en el orden en que aparecen. */
	chords: string[];
	placements: SheetPlacement[];
}

interface ColumnChord {
	/** Columna en grafemas, que es lo que ve quien lee la hoja. */
	column: number;
	value: string;
}

interface SheetLine {
	text: string;
	chords: ColumnChord[];
	/** Línea instrumental: sin letra debajo, sus acordes van sobre espacios. */
	chordOnly: boolean;
}

/*
 * Gramática estricta para DETECTAR acordes. `isValidChord` es tolerante a
 * propósito (acepta cualquier letra en la calidad) y con ella "Dame" o
 * "Cantemos" pasarían por acordes: aquí solo valen las piezas que de verdad se
 * escriben en un acorde. Las alternativas largas van antes que 'm'.
 */
const NOTE = '[A-G](?:#|b|♯|♭)?';
const QUALITY =
	'(?:maj|min|dim|aug|sus|add|alt|omit|no|m|M|Δ|∆|°|º|ø|\\+|-|\\d|[#b♯♭](?=\\d)|\\([^()\\s]{1,12}\\))*';
const STRICT_CHORD_REGEX = new RegExp(`^${NOTE}${QUALITY}(?:/${NOTE})?$`, 'u');

/** Barras de compás, repeticiones ("x2", "2x") y "N.C." pueden ir entre los acordes. */
const IGNORABLE_REGEX = /^(?:[|/\\\-–—~.*%:]+|x\d+|\d+x|n\.?c\.?)$/iu;

/** Etiqueta al principio de una línea de acordes: "Intro:", "[Coro]", "(Puente)". */
const LABEL_PREFIX_REGEX = /^\s*(?:\[[^\]\n]+\]|\([^)\n]+\)|[^\s:[\]()|][^:[\]()|\n]{0,24}:)/u;

/**
 * Encabezado de sección en una línea propia. Los paréntesis no cuentan: "(oh oh)"
 * suele ser letra, y los acordes de encima son suyos.
 */
const HEADER_REGEX = /^\s*(?:\[[^\]\n]+\]|[^\s:[\]][^:\n]{0,24}:)\s*$/u;

const INLINE_CHORD_REGEX = /\[([^\]\s]+)\]/gu;

const TAB_SIZE = 8;

function isChordToken(token: string): boolean {
	return token.length <= MAX_CHORD_LENGTH && STRICT_CHORD_REGEX.test(token) && isValidChord(token);
}

function graphemeCount(text: string): number {
	return splitGraphemes(text).length;
}

function expandTabs(line: string): string {
	if (!line.includes('\t')) return line;
	let out = '';
	for (const character of line) {
		out += character === '\t' ? ' '.repeat(TAB_SIZE - (out.length % TAB_SIZE)) : character;
	}
	return out;
}

type TokenKind =
	{ kind: 'chord'; value: string; lead: number } | { kind: 'ignore' } | { kind: 'other' };

function classifyToken(token: string): TokenKind {
	if (isChordToken(token)) return { kind: 'chord', value: token, lead: 0 };
	// "[C]", "(Am)", "|D": el acorde empieza después de lo que lo envuelve.
	const lead = /^[|([{]*/u.exec(token)?.[0].length ?? 0;
	const core = token.slice(lead).replace(/[|)\]},;*]+$/u, '');
	if (core && isChordToken(core)) return { kind: 'chord', value: core, lead };
	if (!core || IGNORABLE_REGEX.test(core)) return { kind: 'ignore' };
	return { kind: 'other' };
}

/** Una línea hecha solo de acordes (y adornos), con su etiqueta si la lleva. */
function readChordLine(raw: string): { label: string; chords: ColumnChord[] } | null {
	const line = expandTabs(raw);
	let label = '';
	const labelMatch = LABEL_PREFIX_REGEX.exec(line);
	if (labelMatch && !isChordToken(labelMatch[0].replace(/[\s[\]():]/gu, ''))) {
		label = labelMatch[0];
	}

	const chords: ColumnChord[] = [];
	for (const match of line.slice(label.length).matchAll(/\S+/gu)) {
		const token = classifyToken(match[0]);
		if (token.kind === 'other') return null;
		if (token.kind === 'chord') {
			const index = label.length + (match.index ?? 0) + token.lead;
			chords.push({
				column: graphemeCount(line.slice(0, index)),
				value: normalizeChord(token.value)
			});
		}
	}
	return chords.length > 0 ? { label, chords } : null;
}

/** ChordPro: "[C]Hola [G]mundo". Los corchetes que no son acordes se quedan. */
function readInlineChords(raw: string): { text: string; chords: ColumnChord[] } | null {
	let text = '';
	let last = 0;
	const chords: ColumnChord[] = [];
	for (const match of raw.matchAll(INLINE_CHORD_REGEX)) {
		if (!isChordToken(match[1])) continue;
		const index = match.index ?? 0;
		text += raw.slice(last, index);
		last = index + match[0].length;
		// "[C][G]Hola": dos acordes no caben en la misma posición, así que el
		// segundo se separa con un espacio.
		if (chords.length > 0 && chords[chords.length - 1].column >= graphemeCount(text)) text += ' ';
		chords.push({ column: graphemeCount(text), value: normalizeChord(match[1]) });
	}
	if (chords.length === 0) return null;
	return { text: text + raw.slice(last), chords };
}

function isLyricLine(line: string | undefined): line is string {
	return (
		line !== undefined &&
		line.trim() !== '' &&
		!HEADER_REGEX.test(line) &&
		!readChordLine(line) &&
		!readInlineChords(line)
	);
}

export function parseChordSheet(input: string): ChordSheet | null {
	const rawLines = input.replace(/\r\n?/g, '\n').split('\n');
	const lines: SheetLine[] = [];
	let columnChordLines = 0;
	let mostChordsInALine = 0;
	let inlineChordLines = 0;

	for (let index = 0; index < rawLines.length; index++) {
		const raw = rawLines[index];
		const chordLine = readChordLine(raw);
		if (chordLine) {
			columnChordLines++;
			mostChordsInALine = Math.max(mostChordsInALine, chordLine.chords.length);
			const next = rawLines[index + 1];
			// Con etiqueta ("Intro: D G") es instrumental aunque debajo haya letra.
			if (!chordLine.label && isLyricLine(next)) {
				lines.push({ text: expandTabs(next), chords: chordLine.chords, chordOnly: false });
				index++;
			} else {
				lines.push({ text: chordLine.label, chords: chordLine.chords, chordOnly: true });
			}
			continue;
		}

		const inline = readInlineChords(raw);
		if (inline) {
			inlineChordLines++;
			lines.push({ ...inline, chordOnly: false });
			continue;
		}

		lines.push({ text: raw, chords: [], chordOnly: false });
	}

	// Una sola línea con un solo "acorde" ("Am" encima de "I wrong?") es más
	// probable que sea letra. Los corchetes de ChordPro, en cambio, no dejan dudas.
	if (inlineChordLines === 0 && columnChordLines < 2 && mostChordsInALine < 2) return null;

	const texts: string[] = [];
	const chords: string[] = [];
	const placements: SheetPlacement[] = [];
	let start = 0;

	for (const line of lines) {
		let text = line.text;
		if (line.chords.length > 0) {
			const lastColumn = Math.max(...line.chords.map(({ column }) => column));
			// Si un acorde cae más allá del final, se rellena con espacios para que
			// quede donde estaba. En una línea instrumental el último acorde necesita
			// además un carácter debajo: así la línea no queda vacía.
			const needed = line.chordOnly ? lastColumn + 1 : lastColumn;
			const missing = needed - graphemeCount(text);
			if (missing > 0) text += ' '.repeat(missing);

			const graphemes = splitGraphemes(text);
			for (const { column, value } of line.chords) {
				const local = column < graphemes.length ? graphemes[column].offset : text.length;
				placements.push({ chord: value, offset: start + local });
				if (!chords.includes(value)) chords.push(value);
			}
		}
		texts.push(text);
		start += text.length + 1;
	}

	return { lyrics: texts.join('\n'), chords, placements };
}

interface SongChordState {
	lyrics: string;
	chords: SongChordInput[];
	placements: ChordPlacement[];
}

/**
 * Mete lo importado en la canción del formulario, sustituyendo el texto entre
 * `start` y `end` (lo seleccionado al pegar). Un acorde que ya está en el
 * catálogo, aunque esté escrito de otra forma ('am' y 'Am'), se reutiliza; los
 * que faltan se añaden con un id nuevo para que sus apariciones puedan
 * apuntarles antes de guardar.
 */
export function applyChordSheet(
	current: SongChordState,
	sheet: ChordSheet,
	start: number,
	end: number,
	createId: () => string
): SongChordState & { added: number; dropped: boolean } {
	const chords = current.chords.map((chord) => ({ ...chord }));
	const ids: Array<[string, string]> = [];
	let added = 0;

	for (const value of sheet.chords) {
		let index = chords.findIndex(
			(chord) =>
				typeof chord.value === 'string' &&
				isValidChord(chord.value) &&
				normalizeChord(chord.value) === value
		);
		if (index === -1) {
			chords.push({ id: createId(), value });
			added++;
			index = chords.length - 1;
		} else if (typeof chords[index].id !== 'string') {
			chords[index] = { ...chords[index], id: createId() };
		}
		ids.push([value, chords[index].id as string]);
	}

	const spliced = splicePlacements(current.placements, start, end, sheet.lyrics.length);
	let placements = spliced.placements;
	for (const { chord, offset } of sheet.placements) {
		const chordId = ids.find(([value]) => value === chord)?.[1];
		if (chordId) placements = upsertPlacement(placements, { chordId, offset: start + offset });
	}

	return {
		lyrics: current.lyrics.slice(0, start) + sheet.lyrics + current.lyrics.slice(end),
		chords,
		placements,
		added,
		dropped: spliced.dropped
	};
}
