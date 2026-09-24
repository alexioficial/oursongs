/**
 * Transposición de acordes por semitonos.
 *
 * Todo el cálculo se hace sobre clases de altura (0-11, con C = 0) y nunca
 * sobre las letras. Eso es lo que hace que los dos casos "raros" de la escala
 * salgan solos: de E a F y de B a C hay un único semitono, no dos, y eso ya
 * está recogido en LETTER_SEMITONES (E = 4 → F = 5; B = 11 → C = 0 al dar la
 * vuelta con el módulo).
 *
 * El módulo es puro: lo usa tanto el cliente (la vista de una canción) como el
 * servidor (validación al guardar). Transponer NUNCA modifica lo guardado.
 */

export type Spelling = 'sharp' | 'flat';
export type Accidentals = Spelling | 'auto';

export interface ParsedNote {
	/** Letra de la nota, siempre en mayúscula. */
	letter: string;
	/** Alteraciones ya normalizadas a `#` / `b` ('' si es natural). */
	accidental: string;
	/** Clase de altura 0-11. */
	pitch: number;
	spelling: Spelling | 'natural';
}

export interface ParsedChord {
	root: ParsedNote;
	/** Calidad y extensiones tal como las escribió el usuario: 'm7add11', 'maj7', ''… */
	quality: string;
	/** Bajo de un acorde con barra ('C/G'), o null. */
	bass: ParsedNote | null;
}

const LETTER_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const ACCIDENTAL_OFFSETS: Record<string, number> = { '#': 1, '♯': 1, b: -1, '♭': -1 };

/** Raíz (letra + alteraciones) y todo lo que venga detrás. */
const NOTE_REGEX = /^([A-Ga-g])([#b♯♭]*)(.*)$/;

/** Caracteres admitidos en la calidad. La barra queda fuera a propósito. */
const QUALITY_REGEX = /^[A-Za-z0-9#b♯♭+\-°ºøΔ∆()]*$/;

export const MAX_CHORD_LENGTH = 24;

export function mod12(value: number): number {
	return ((value % 12) + 12) % 12;
}

/**
 * Lleva cualquier cantidad de semitonos al rango (-12, 12) conservando el
 * signo, de modo que doce pasos arriba (o abajo) vuelven al acorde original.
 */
export function wrapSemitones(semitones: number): number {
	const steps = Math.trunc(semitones) % 12;
	// `-12 % 12` es -0 en JS; devolverlo se filtraría a la UI y a las comparaciones.
	return steps === 0 ? 0 : steps;
}

/** Etiqueta para la UI: 0 → '0', 2 → '+2', -3 → '-3'. */
export function formatSemitones(semitones: number): string {
	const steps = wrapSemitones(semitones);
	return steps > 0 ? `+${steps}` : String(steps);
}

/** Una nota leída más lo que venía detrás, que quien llama interpreta. */
interface ParsedNoteWithRest extends ParsedNote {
	rest: string;
}

function parseNote(text: string): ParsedNoteWithRest | null {
	const match = NOTE_REGEX.exec(text);
	if (!match) return null;

	const [, rawLetter, accidentals, rest] = match;
	const letter = rawLetter.toUpperCase();

	let offset = 0;
	for (const character of accidentals) offset += ACCIDENTAL_OFFSETS[character] ?? 0;

	const spelling: ParsedNote['spelling'] = offset > 0 ? 'sharp' : offset < 0 ? 'flat' : 'natural';
	const symbol = offset > 0 ? '#' : 'b';

	return {
		letter,
		accidental: symbol.repeat(Math.abs(offset)),
		pitch: mod12(LETTER_SEMITONES[letter] + offset),
		spelling,
		rest
	};
}

export function parseChord(chord: string): ParsedChord | null {
	const text = chord.trim();
	if (!text) return null;

	const root = parseNote(text);
	if (!root) return null;

	// Acorde con bajo ('C/G', 'G#m7add11/D#'). Si lo que sigue a la última barra
	// no es una nota suelta (el '9' de un 'C6/9', por ejemplo) se queda dentro de
	// la calidad y no se transpone.
	const slash = root.rest.lastIndexOf('/');
	if (slash !== -1) {
		const bass = parseNote(root.rest.slice(slash + 1));
		if (bass && bass.rest === '') {
			return { root, quality: root.rest.slice(0, slash), bass };
		}
	}

	return { root, quality: root.rest, bass: null };
}

/** ¿Es algo que tenga sentido guardar como acorde? */
export function isValidChord(chord: string): boolean {
	const text = chord.trim();
	if (!text || text.length > MAX_CHORD_LENGTH) return false;
	const parsed = parseChord(text);
	if (!parsed) return false;
	return QUALITY_REGEX.test(parsed.quality);
}

function noteText(note: ParsedNote): string {
	return note.letter + note.accidental;
}

/**
 * Forma canónica para guardar: 'am7' → 'Am7', 'c/g' → 'C/G', '♭' → 'b'.
 * La calidad se respeta tal cual, que ahí cada uno tiene su manera de escribir.
 */
export function normalizeChord(chord: string): string {
	const text = chord.trim();
	const parsed = parseChord(text);
	if (!parsed) return text;
	const bass = parsed.bass ? `/${noteText(parsed.bass)}` : '';
	return `${noteText(parsed.root)}${parsed.quality}${bass}`;
}

function spellPitch(pitch: number, spelling: Spelling): string {
	return (spelling === 'flat' ? FLAT_NAMES : SHARP_NAMES)[mod12(pitch)];
}

/**
 * Decide si una lista se escribe con sostenidos o con bemoles. En modo 'auto'
 * gana lo que ya usaba la canción (una canción en Bb sigue en bemoles al
 * transponer), y en caso de empate o de no haber alteraciones, sostenidos.
 */
export function resolveSpelling(chords: string[], accidentals: Accidentals = 'auto'): Spelling {
	if (accidentals !== 'auto') return accidentals;

	let flats = 0;
	let sharps = 0;
	for (const chord of chords) {
		const parsed = parseChord(chord);
		if (!parsed) continue;
		for (const note of [parsed.root, parsed.bass]) {
			if (note?.spelling === 'flat') flats++;
			if (note?.spelling === 'sharp') sharps++;
		}
	}
	return flats > sharps ? 'flat' : 'sharp';
}

/**
 * Transpone un acorde. `spelling` en 'auto' respeta la alteración del propio
 * acorde; para una lista completa conviene resolverla antes con
 * `resolveSpelling` para que toda la canción se escriba igual.
 */
export function transposeChord(
	chord: string,
	semitones: number,
	accidentals: Accidentals = 'auto'
): string {
	const steps = wrapSemitones(semitones);
	// Sin transposición devolvemos el texto intacto: así un 'Cb' escrito a mano
	// sigue siendo 'Cb' y no se convierte en su enarmónico 'B'.
	if (steps === 0) return chord;

	const parsed = parseChord(chord);
	if (!parsed) return chord;

	const spelling: Spelling =
		accidentals === 'auto' ? resolveSpelling([chord], 'auto') : accidentals;

	const root = spellPitch(parsed.root.pitch + steps, spelling);
	const bass = parsed.bass ? `/${spellPitch(parsed.bass.pitch + steps, spelling)}` : '';
	return `${root}${parsed.quality}${bass}`;
}

/**
 * Lee una progresión escrita de corrido ('C G Am F' o 'C, G, Am') y la parte en
 * la lista que se guarda. Escribir la progresión en una línea es mucho más
 * cómodo que ir añadiendo acordes de uno en uno.
 */
export function chordsFromText(text: string): string[] {
	if (typeof text !== 'string') return [];
	return text.split(/[\s,|]+/).filter(Boolean);
}

/** La vuelta de `chordsFromText`, para rellenar el formulario. */
export function chordsToText(chords: string[]): string {
	return chords.join(' ');
}

/** Transpone una lista entera con una escritura coherente para todos. */
export function transposeChords(
	chords: string[],
	semitones: number,
	accidentals: Accidentals = 'auto'
): string[] {
	const steps = wrapSemitones(semitones);
	if (steps === 0) return [...chords];
	const spelling = resolveSpelling(chords, accidentals);
	return chords.map((chord) => transposeChord(chord, steps, spelling));
}
