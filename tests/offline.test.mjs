import { describe, expect, test } from 'bun:test';
import {
	filterSongs,
	pendingToSong,
	prepareChords,
	shouldServeShell,
	toSummary
} from '../src/lib/offline/logic.ts';

const song = (id, title, extra = {}) => ({
	id,
	title,
	chords: [],
	tagIds: [],
	updatedAt: '2026-09-01T00:00:00.000Z',
	...extra
});

describe('búsqueda sin conexión', () => {
	const songs = [
		song('1', 'Alegraos', {
			artist: 'Coro',
			tagIds: ['a', 'b'],
			updatedAt: '2026-09-02T00:00:00.000Z'
		}),
		song('2', 'Señor y Mediador', { tagIds: ['a'], updatedAt: '2026-09-03T00:00:00.000Z' }),
		song('3', 'Toma mi vida', { artist: 'Juan', updatedAt: '2026-09-01T00:00:00.000Z' })
	];

	test('busca en título y artista sin distinguir mayúsculas, como el servidor', () => {
		expect(filterSongs(songs, 'CORO', []).map(({ id }) => id)).toEqual(['1']);
		expect(filterSongs(songs, 'señor', []).map(({ id }) => id)).toEqual(['2']);
	});

	test('exige todos los tags elegidos', () => {
		expect(filterSongs(songs, '', ['a']).map(({ id }) => id)).toEqual(['2', '1']);
		expect(filterSongs(songs, '', ['a', 'b']).map(({ id }) => id)).toEqual(['1']);
	});

	test('ordena por la última actualización', () => {
		expect(filterSongs(songs, '', []).map(({ id }) => id)).toEqual(['2', '1', '3']);
	});
});

describe('canciones creadas sin conexión', () => {
	const pending = {
		clientId: 'c1',
		userId: 'u1',
		createdAt: '2026-09-05T10:00:00.000Z',
		input: {
			title: 'Nueva',
			artist: '',
			rhythm: '6/8',
			lyrics: 'Hola',
			chords: [{ id: 'x', value: 'am' }],
			chordPlacements: [{ chordId: 'x', offset: 0 }],
			tagIds: ['t']
		}
	};

	test('se enseñan como una canción normal', () => {
		expect(pendingToSong(pending)).toEqual({
			id: 'c1',
			title: 'Nueva',
			rhythm: '6/8',
			lyrics: 'Hola',
			chords: [{ id: 'x', value: 'Am' }],
			chordPlacements: [{ chordId: 'x', offset: 0 }],
			tagIds: ['t'],
			createdAt: '2026-09-05T10:00:00.000Z',
			updatedAt: '2026-09-05T10:00:00.000Z',
			createdBy: 'u1'
		});
	});

	test('el resumen no lleva la letra', () => {
		const summary = toSummary(pendingToSong(pending));
		expect(summary).not.toHaveProperty('lyrics');
		expect(summary).not.toHaveProperty('chordPlacements');
		expect(summary.title).toBe('Nueva');
	});

	test('cada acorde recibe un id para que la letra pueda apuntarle', () => {
		let next = 0;
		expect(
			prepareChords([{ id: 'keep', value: 'C' }, { value: 'G' }], () => `new-${++next}`)
		).toEqual([
			{ id: 'keep', value: 'C' },
			{ id: 'new-1', value: 'G' }
		]);
	});
});

describe('service worker', () => {
	test('sirve la app guardada si el servidor falla o limita', () => {
		expect(shouldServeShell(500)).toBe(true);
		expect(shouldServeShell(503)).toBe(true);
		expect(shouldServeShell(429)).toBe(true);
	});

	test('no tapa redirecciones ni errores del usuario', () => {
		expect(shouldServeShell(200)).toBe(false);
		expect(shouldServeShell(303)).toBe(false);
		expect(shouldServeShell(404)).toBe(false);
	});
});
