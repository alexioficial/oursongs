/**
 * Cómo se reparte una línea con acordes en la hoja impresa. En pantalla una
 * línea larga se desplaza de lado; en papel no hay desplazamiento y hay que
 * partirla, pero partir la letra y los acordes por separado (como hace el
 * navegador con dos líneas de texto) descuadra los acordes. Aquí se parte la
 * línea entera, y cada trozo se lleva sus acordes.
 *
 * Es puro y va por columnas de grafemas, como el resto de la alineación: lo
 * prueban los tests.
 */
import { splitGraphemes, type PositionedChord } from './chordPlacements';

export interface PrintLine {
	text: string;
	/** Columnas ya relativas al principio del trozo. */
	chords: PositionedChord[];
}

const WHITESPACE = /^\s+$/u;

/**
 * Parte una línea en trozos de como mucho `maxColumns` columnas, contando los
 * acordes de encima, que también ocupan. Se corta con preferencia al principio
 * de una palabra; solo si una palabra no cabe entera se corta por dentro. Los
 * espacios al final de un trozo no cuentan porque no se ven.
 */
export function wrapChordLine(
	text: string,
	chords: PositionedChord[],
	maxColumns: number
): PrintLine[] {
	const graphemes = splitGraphemes(text).map(({ text: grapheme }) => grapheme);
	const length = graphemes.length;
	const max = Math.max(1, Math.floor(maxColumns));
	const isSpace = (index: number) => WHITESPACE.test(graphemes[index]);
	const isWordStart = (index: number) => !isSpace(index) && isSpace(index - 1);

	// ¿Cabe el trozo [start, end)? El último se queda además con los acordes que
	// van justo al final de la línea (columna === length).
	const fits = (start: number, end: number, last: boolean) => {
		let width = end - start;
		while (width > 0 && isSpace(start + width - 1)) width--;
		if (width > max) return false;
		return chords.every(
			({ column, label }) =>
				column < start ||
				(last ? false : column >= end) ||
				// Un acorde al principio del trozo cabe siempre: no hay otro sitio.
				column === start ||
				column - start + label.length <= max
		);
	};

	const lines: PrintLine[] = [];
	const push = (start: number, end: number, last: boolean) => {
		lines.push({
			text: graphemes.slice(start, end).join('').trimEnd(),
			chords: chords
				.filter(({ column }) => column >= start && (last || column < end))
				.map((chord) => ({ ...chord, column: chord.column - start }))
		});
	};

	let start = 0;
	for (;;) {
		if (fits(start, length, true)) {
			push(start, length, true);
			return lines;
		}
		// Cuanto más largo el trozo, más fácil que no quepa: se busca el corte más
		// lejano que todavía cabe, prefiriendo un principio de palabra (o el final
		// del texto, si lo que no cabe es un acorde que va detrás).
		let preferred = -1;
		let lastFit = -1;
		for (let end = start + 1; end <= length; end++) {
			if (!fits(start, end, false)) break;
			lastFit = end;
			if (end === length || isWordStart(end)) preferred = end;
		}
		const end = preferred !== -1 ? preferred : lastFit;
		push(start, end, false);
		start = end;
	}
}

/** Una fila de acordes como texto, con cada uno en su columna. */
export function chordRowText(row: PositionedChord[]): string {
	let text = '';
	for (const chord of row) {
		text += ' '.repeat(Math.max(0, chord.column - text.length)) + chord.label;
	}
	return text;
}
