import { describe, expect, test } from 'bun:test';
import { chordCatalogProblems } from '../src/lib/music/chordCatalog.ts';

describe('borrador del catálogo', () => {
	test('marca valores inválidos', () => {
		expect(chordCatalogProblems([{ value: 'C' }, { value: 'N.C.' }])).toEqual([
			null,
			'No parece un acorde'
		]);
	});

	test('marca cada repetición después de normalizar', () => {
		expect(chordCatalogProblems([{ value: 'am' }, { value: 'Am' }, { value: 'G' }])).toEqual([
			null,
			'El acorde está repetido',
			null
		]);
	});

	test('acepta un catálogo vacío', () => {
		expect(chordCatalogProblems([])).toEqual([]);
	});
});
