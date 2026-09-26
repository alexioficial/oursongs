import { describe, expect, test } from 'bun:test';
import { applyChordSheet, parseChordSheet } from '../src/lib/music/chordSheet.ts';
import { splitGraphemes } from '../src/lib/music/chordPlacements.ts';

/**
 * Vuelve a dibujar el resultado con los acordes encima de la letra. Si el
 * importador hace bien su trabajo, sale lo mismo que se pegó (salvo espacios al
 * final de línea, que no se ven).
 */
function render(sheet) {
	const out = [];
	let start = 0;
	for (const text of sheet.lyrics.split('\n')) {
		const end = start + text.length;
		const graphemes = splitGraphemes(text);
		const here = sheet.placements.filter(({ offset }) => offset >= start && offset <= end);
		if (here.length > 0) {
			let chordLine = '';
			for (const { chord, offset } of here) {
				const column = graphemes.filter((g) => g.offset < offset - start).length;
				chordLine = chordLine.padEnd(column) + chord;
			}
			out.push(chordLine);
		}
		// Una línea solo de acordes se guarda como espacios: no se dibuja.
		if (!(here.length > 0 && text.trim() === '')) out.push(text);
		start = end + 1;
	}
	return out.map((line) => line.trimEnd()).join('\n');
}

const tidy = (text) =>
	text
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n');

describe('importar acordes encima de la letra', () => {
	const example = [
		'D                    Bm',
		'Used to do it all so pure for the love of',
		'            F#m',
		'The song no more',
		'                      G',
		'Now I think about an applause when',
		'           D',
		' I open my mouth',
		'                  Bm',
		"I've abandoned my emotions"
	].join('\n');

	test('separa la letra y coloca cada acorde en su columna', () => {
		const sheet = parseChordSheet(example);
		expect(sheet.lyrics).toBe(
			[
				'Used to do it all so pure for the love of',
				'The song no more',
				'Now I think about an applause when',
				' I open my mouth',
				"I've abandoned my emotions"
			].join('\n')
		);
		expect(sheet.chords).toEqual(['D', 'Bm', 'F#m', 'G']);
		expect(sheet.placements.slice(0, 3)).toEqual([
			{ chord: 'D', offset: 0 },
			{ chord: 'Bm', offset: 21 },
			{ chord: 'F#m', offset: 42 + 12 }
		]);
	});

	test('dibujado de nuevo queda igual que lo pegado', () => {
		expect(render(parseChordSheet(example))).toBe(tidy(example));
	});

	test('entiende acordes avanzados', () => {
		const text = [
			'G#m7add11/D#   Cmaj7  Bm7(b5)   Dsus4  E7#9',
			'Una línea bastante larga de la letra'
		].join('\n');
		const sheet = parseChordSheet(text);
		expect(sheet.chords).toEqual(['G#m7add11/D#', 'Cmaj7', 'Bm7(b5)', 'Dsus4', 'E7#9']);
		expect(render(sheet)).toBe(tidy(text));
	});

	test('rellena con espacios si un acorde cae más allá del final de la línea', () => {
		const text = ['C           G', 'Hola'].join('\n');
		const sheet = parseChordSheet(text);
		expect(sheet.lyrics).toBe('Hola        ');
		expect(sheet.placements).toEqual([
			{ chord: 'C', offset: 0 },
			{ chord: 'G', offset: 12 }
		]);
	});

	test('una línea de acordes sin letra debajo se queda como línea propia', () => {
		const text = ['D   Bm   G   A', '', 'C        G', 'Hola mundo cruel'].join('\n');
		const sheet = parseChordSheet(text);
		const [intro] = sheet.lyrics.split('\n');
		expect(intro.trim()).toBe('');
		expect(render(sheet)).toBe(tidy(text));
	});

	test('una etiqueta con acordes es instrumental aunque debajo haya letra', () => {
		const text = ['Intro: D  G  A', 'Hola mundo'].join('\n');
		const sheet = parseChordSheet(text);
		expect(sheet.lyrics.split('\n')[1]).toBe('Hola mundo');
		expect(sheet.lyrics.split('\n')[0].trimEnd()).toBe('Intro:');
		expect(sheet.placements).toEqual([
			{ chord: 'D', offset: 7 },
			{ chord: 'G', offset: 10 },
			{ chord: 'A', offset: 13 }
		]);
	});

	test('no pega los acordes a un encabezado de sección', () => {
		const text = ['D   Bm   G   A', '[Coro]', 'C        G', 'Hola mundo'].join('\n');
		const sheet = parseChordSheet(text);
		expect(sheet.lyrics.split('\n')[1]).toBe('[Coro]');
		expect(render(sheet)).toBe(tidy(text));
	});

	test('ignora barras de compás y marcas de repetición', () => {
		const text = ['| D   Bm |  G   (x2)', 'Hola mundo cruel y raro'].join('\n');
		const sheet = parseChordSheet(text);
		expect(sheet.chords).toEqual(['D', 'Bm', 'G']);
		expect(sheet.placements.map(({ offset }) => offset)).toEqual([2, 6, 12]);
	});

	test('acepta acordes entre corchetes o paréntesis en la línea de acordes', () => {
		const sheet = parseChordSheet(['[C]      (Am)', 'Hola mundo cruel'].join('\n'));
		expect(sheet.chords).toEqual(['C', 'Am']);
		expect(sheet.placements.map(({ offset }) => offset)).toEqual([1, 10]);
	});

	test('convierte los tabuladores de la línea de acordes', () => {
		const sheet = parseChordSheet(['C\tG', 'Hola mundo cruel'].join('\n'));
		expect(sheet.placements).toEqual([
			{ chord: 'C', offset: 0 },
			{ chord: 'G', offset: 8 }
		]);
	});

	test('normaliza la escritura de los acordes', () => {
		const sheet = parseChordSheet(['F♯m   B♭', 'Hola mundo'].join('\n'));
		expect(sheet.chords).toEqual(['F#m', 'Bb']);
	});
});

describe('formato ChordPro en línea', () => {
	test('saca los acordes entre corchetes y los coloca en su sitio', () => {
		const sheet = parseChordSheet('[C]Hola [G]mundo [Am7]cruel');
		expect(sheet.lyrics).toBe('Hola mundo cruel');
		expect(sheet.placements).toEqual([
			{ chord: 'C', offset: 0 },
			{ chord: 'G', offset: 5 },
			{ chord: 'Am7', offset: 11 }
		]);
	});

	test('deja los corchetes que no son acordes', () => {
		const sheet = parseChordSheet('[Verso 1]\n[C]Hola');
		expect(sheet.lyrics).toBe('[Verso 1]\nHola');
	});

	test('dos acordes seguidos no se pisan', () => {
		const sheet = parseChordSheet('[C][G]Hola');
		expect(new Set(sheet.placements.map(({ offset }) => offset)).size).toBe(2);
	});
});

describe('letras normales no se tocan', () => {
	test('letra en español', () => {
		const text = [
			'Alegraos, Alegraos en el Señor',
			'Su riqueza recibimos de su amor (2x)',
			'',
			'Dame tu amor, Cantemos al Padre',
			'A ti Señor',
			'Eres mi Dios',
			'(CORO)'
		].join('\n');
		expect(parseChordSheet(text)).toBeNull();
	});

	test('una sola línea que parece un acorde no basta', () => {
		expect(parseChordSheet('Am\nI wrong?')).toBeNull();
	});

	test('palabras que empiezan como un acorde no cuentan', () => {
		expect(parseChordSheet('Bebe Cada Gana\nFace Ave Dame')).toBeNull();
	});
});

describe('pegar sobre una canción que ya tiene cosas', () => {
	const sheet = parseChordSheet(['Am     G', 'Nuevo verso'].join('\n'));
	let next = 0;
	const createId = () => `new-${++next}`;

	test('reutiliza los acordes del catálogo y añade los que faltan', () => {
		next = 0;
		const result = applyChordSheet(
			{
				lyrics: 'Hola\nAdiós',
				chords: [{ id: 'g', value: 'G' }, { value: 'C' }],
				placements: [{ chordId: 'g', offset: 5 }]
			},
			sheet,
			5,
			5,
			createId
		);
		expect(result.lyrics).toBe('Hola\nNuevo versoAdiós');
		expect(result.chords).toEqual([
			{ id: 'g', value: 'G' },
			{ value: 'C' },
			{ id: 'new-1', value: 'Am' }
		]);
		expect(result.added).toBe(1);
		expect(result.placements).toEqual([
			{ chordId: 'new-1', offset: 5 },
			{ chordId: 'g', offset: 12 },
			{ chordId: 'g', offset: 16 }
		]);
	});

	test('reconoce un acorde del catálogo escrito de otra forma', () => {
		next = 0;
		const result = applyChordSheet(
			{ lyrics: '', chords: [{ value: 'am' }], placements: [] },
			sheet,
			0,
			0,
			createId
		);
		expect(result.chords).toEqual([
			{ id: 'new-1', value: 'am' },
			{ id: 'new-2', value: 'G' }
		]);
		expect(result.placements.map(({ chordId }) => chordId)).toEqual(['new-1', 'new-2']);
	});
});
