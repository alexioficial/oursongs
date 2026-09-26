import { describe, expect, test } from 'bun:test';
import {
	dropPlacement,
	lineVisualWidth,
	movePlacement,
	offsetAtColumn,
	packChordRows,
	placementOffsets,
	placementsForLine,
	remapPlacements,
	removePlacementsForChord,
	splicePlacements,
	splitGraphemes,
	splitLyricLines,
	trimLyrics,
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

	test('encuentra posiciones de una línea por columna de grafema', () => {
		const line = { text: 'a🎵b', start: 5, end: 9 };
		const chords = new Map([
			['a', 'C'],
			['b', 'G']
		]);
		expect(
			placementsForLine(
				line,
				[
					{ chordId: 'a', offset: 6 },
					{ chordId: 'b', offset: 9 }
				],
				chords
			)
		).toEqual([
			{ chordId: 'a', offset: 6, column: 1, label: 'C' },
			{ chordId: 'b', offset: 9, column: 3, label: 'G' }
		]);
	});

	test('distribuye etiquetas que se solapan en filas diferentes', () => {
		const rows = packChordRows([
			{ chordId: 'a', offset: 0, column: 0, label: 'Cmaj7' },
			{ chordId: 'b', offset: 2, column: 2, label: 'Bm7' },
			{ chordId: 'c', offset: 9, column: 9, label: 'Em' }
		]);
		expect(rows.map((row) => row.map(({ chordId }) => chordId))).toEqual([['a', 'c'], ['b']]);
	});

	test('ofrece solo límites de grafemas como posiciones', () => {
		expect(placementOffsets('a🎵b')).toEqual([0, 1, 3, 4]);
	});

	test('mueve una aparición al límite contiguo sin partir grafemas', () => {
		expect(movePlacement([{ chordId: 'a', offset: 1 }], 1, 1, 'a🎵b')).toEqual([
			{ chordId: 'a', offset: 3 }
		]);
	});

	test('no mueve sobre otra aparición ni fuera de la letra', () => {
		const placements = [
			{ chordId: 'a', offset: 0 },
			{ chordId: 'b', offset: 1 }
		];
		expect(movePlacement(placements, 0, 1, 'ab')).toEqual(placements);
		expect(movePlacement(placements, 0, -1, 'ab')).toEqual(placements);
	});

	test('mantiene en una fila acordes que tienen separación suficiente', () => {
		const rows = packChordRows([
			{ chordId: 'a', offset: 0, column: 0, label: 'C' },
			{ chordId: 'b', offset: 8, column: 8, label: 'G#m7' }
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0].map(({ column }) => column)).toEqual([0, 8]);
	});

	test('el ancho visual incluye texto y acordes que sobresalen', () => {
		expect(lineVisualWidth('', [{ chordId: 'a', offset: 0, column: 0, label: 'Cmaj7' }])).toBe(5);
		expect(lineVisualWidth('a🎵b', [])).toBe(3);
	});

	test('traduce una columna de la línea a un offset global sin partir grafemas', () => {
		const [, line] = splitLyricLines('uno\na🎵b');
		expect(offsetAtColumn(line, 0)).toBe(4);
		expect(offsetAtColumn(line, 1)).toBe(5);
		expect(offsetAtColumn(line, 2)).toBe(7);
		expect(offsetAtColumn(line, 3)).toBe(8);
	});

	test('una columna fuera de la línea cae en su principio o su final', () => {
		const [line] = splitLyricLines('ab');
		expect(offsetAtColumn(line, -3)).toBe(0);
		expect(offsetAtColumn(line, 40)).toBe(2);
		expect(offsetAtColumn(splitLyricLines('')[0], 5)).toBe(0);
	});

	test('soltar un acorde nuevo lo añade en orden', () => {
		expect(dropPlacement([{ chordId: 'a', offset: 4 }], 'b', null, 1)).toEqual([
			{ chordId: 'b', offset: 1 },
			{ chordId: 'a', offset: 4 }
		]);
	});

	test('soltar un acorde colocado lo mueve en vez de duplicarlo', () => {
		const placements = [
			{ chordId: 'a', offset: 0 },
			{ chordId: 'b', offset: 3 }
		];
		expect(dropPlacement(placements, 'a', 0, 5)).toEqual([
			{ chordId: 'b', offset: 3 },
			{ chordId: 'a', offset: 5 }
		]);
		expect(placements).toHaveLength(2);
	});

	test('soltar sobre otra aparición la reemplaza', () => {
		const placements = [
			{ chordId: 'a', offset: 0 },
			{ chordId: 'b', offset: 3 }
		];
		expect(dropPlacement(placements, 'a', 0, 3)).toEqual([{ chordId: 'a', offset: 3 }]);
	});
});

describe('recorte de la letra al guardar', () => {
	test('quita espacios y saltos de los extremos y desplaza los acordes', () => {
		expect(trimLyrics('\n\n  hola mundo \n\n', [{ chordId: 'a', offset: 7 }])).toEqual({
			lyrics: 'hola mundo',
			placements: [{ chordId: 'a', offset: 3 }]
		});
	});

	test('conserva una línea de solo acordes al principio', () => {
		expect(trimLyrics('\n    \nhola', [{ chordId: 'a', offset: 1 }])).toEqual({
			lyrics: '    \nhola',
			placements: [{ chordId: 'a', offset: 0 }]
		});
	});

	test('conserva una línea de solo acordes al final', () => {
		expect(trimLyrics('hola\n     \n\n', [{ chordId: 'a', offset: 9 }])).toEqual({
			lyrics: 'hola\n    ',
			placements: [{ chordId: 'a', offset: 9 }]
		});
	});

	test('una letra en blanco sin acordes queda vacía', () => {
		expect(trimLyrics('  \n \n', [])).toEqual({ lyrics: '', placements: [] });
	});
});

describe('pegar en medio de la letra', () => {
	test('desplaza lo que queda detrás de lo pegado', () => {
		expect(
			splicePlacements(
				[
					{ chordId: 'a', offset: 0 },
					{ chordId: 'b', offset: 4 }
				],
				4,
				4,
				6
			)
		).toEqual({
			placements: [
				{ chordId: 'a', offset: 0 },
				{ chordId: 'b', offset: 10 }
			],
			dropped: false
		});
	});

	test('quita los acordes de la selección reemplazada', () => {
		expect(
			splicePlacements(
				[
					{ chordId: 'a', offset: 1 },
					{ chordId: 'b', offset: 3 },
					{ chordId: 'c', offset: 5 }
				],
				1,
				4,
				2
			)
		).toEqual({
			placements: [
				{ chordId: 'a', offset: 1 },
				{ chordId: 'c', offset: 4 }
			],
			dropped: true
		});
	});
});
