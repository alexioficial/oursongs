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
});
