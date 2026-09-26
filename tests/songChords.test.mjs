import { describe, expect, test } from 'bun:test';
import {
	normalizeChordCatalog,
	normalizeChordPlacements,
	normalizeSongChordState
} from '../src/lib/server/songChords.ts';

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

	test('rechaza IDs ajenos y repetidos', () => {
		expect(() =>
			normalizeChordCatalog([{ id: 'other', value: 'C' }], [{ id: 'known', value: 'C' }])
		).toThrow('El acorde indicado ya no existe');
		expect(() =>
			normalizeChordCatalog(
				[
					{ id: 'known', value: 'C' },
					{ id: 'known', value: 'G' }
				],
				[{ id: 'known', value: 'C' }]
			)
		).toThrow('El catálogo contiene un identificador repetido');
	});

	test('acepta un ID nuevo del cliente si tiene formato de UUID', () => {
		const id = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';
		expect(normalizeChordCatalog([{ id, value: 'C' }], [])).toEqual([{ id, value: 'C' }]);
	});

	test('rechaza acordes normalizados duplicados', () => {
		expect(() => normalizeChordCatalog([{ value: 'am' }, { value: 'Am' }])).toThrow(
			'El catálogo no puede repetir acordes'
		);
	});

	test('rechaza un valor que no sea un acorde', () => {
		expect(() => normalizeChordCatalog([{ value: 'N.C.' }])).toThrow('"N.C." no parece un acorde');
	});
});

describe('apariciones de acordes', () => {
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

	test('rechaza offsets fuera de la letra o no enteros', () => {
		expect(() => normalizeChordPlacements([{ chordId: 'c', offset: 5 }], chords, 'hola')).toThrow(
			'La posición del acorde no es válida'
		);
		expect(() => normalizeChordPlacements([{ chordId: 'c', offset: 1.5 }], chords, 'hola')).toThrow(
			'La posición del acorde no es válida'
		);
	});

	test('rechaza una posición que parte un grafema', () => {
		expect(() => normalizeChordPlacements([{ chordId: 'c', offset: 2 }], chords, 'a🎵b')).toThrow(
			'La posición del acorde no es válida'
		);
	});
});

describe('estado musical de una canción', () => {
	const current = {
		lyrics: 'hola',
		chords: [{ id: 'c', value: 'C' }],
		chordPlacements: [{ chordId: 'c', offset: 4 }]
	};

	test('renombra un acorde sin perder su aparición', () => {
		expect(
			normalizeSongChordState({ lyrics: 'hola', chords: [{ id: 'c', value: 'Cmaj7' }] }, current)
		).toEqual({
			chords: [{ id: 'c', value: 'Cmaj7' }],
			chordPlacements: [{ chordId: 'c', offset: 4 }]
		});
	});

	test('exige actualizar las apariciones al borrar un acorde usado', () => {
		expect(() => normalizeSongChordState({ lyrics: 'hola', chords: [] }, current)).toThrow(
			'Actualiza también la alineación de los acordes'
		);
	});

	test('permite borrar acorde y apariciones en la misma operación', () => {
		expect(
			normalizeSongChordState({ lyrics: 'hola', chords: [], chordPlacements: [] }, current)
		).toEqual({ chords: [], chordPlacements: [] });
	});

	test('exige remapear una posición que queda fuera al acortar la letra', () => {
		expect(() => normalizeSongChordState({ lyrics: 'ho' }, current)).toThrow(
			'Actualiza también la alineación de los acordes'
		);
	});
});
