/**
 * Lógica pura del modo sin conexión: sin navegador ni IndexedDB, para que la
 * prueben los tests. Lo que toca almacenamiento está en `db.ts`.
 */
import { normalizeChord } from '../music/chords';
import type { ChordPlacement, Song, SongChord, SongChordInput, SongSummary } from '../types';

/** Lo que se manda al crear, ya con un id por acorde. */
export interface PendingSongInput {
	title: string;
	artist: string;
	rhythm: string;
	lyrics: string;
	chords: SongChord[];
	chordPlacements: ChordPlacement[];
	tagIds: string[];
}

/** Una canción creada sin conexión, a la espera de subirse. */
export interface PendingSong {
	/** UUID que la identifica aquí y hace idempotente el alta en el servidor. */
	clientId: string;
	/** Quién la creó: solo se sube con su sesión. */
	userId: string;
	createdAt: string;
	input: PendingSongInput;
	/** El servidor la rechazó: no se reintenta sola. */
	error?: string;
}

export function nowIso(): string {
	return new Date().toISOString();
}

/** Misma búsqueda que el servidor: título o artista, sin distinguir mayúsculas. */
export function filterSongs<T extends SongSummary>(
	songs: T[],
	search: string,
	tagIds: string[]
): T[] {
	const needle = search.trim().toLocaleLowerCase('es');
	return songs
		.filter((song) => {
			if (needle) {
				const haystack = `${song.title}\n${song.artist ?? ''}`.toLocaleLowerCase('es');
				if (!haystack.includes(needle)) return false;
			}
			return tagIds.every((id) => song.tagIds.includes(id));
		})
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function toSummary(song: Song): SongSummary {
	return {
		id: song.id,
		title: song.title,
		...(song.artist && { artist: song.artist }),
		...(song.rhythm && { rhythm: song.rhythm }),
		chords: song.chords,
		tagIds: song.tagIds,
		updatedAt: song.updatedAt
	};
}

/** Para enseñarla como cualquier otra mientras no se sube. */
export function pendingToSong(pending: PendingSong): Song {
	const { input } = pending;
	const artist = input.artist.trim();
	const rhythm = input.rhythm.trim();
	return {
		id: pending.clientId,
		title: input.title.trim(),
		...(artist && { artist }),
		...(rhythm && { rhythm }),
		lyrics: input.lyrics,
		chords: input.chords.map(({ id, value }) => ({ id, value: normalizeChord(value) })),
		chordPlacements: input.chordPlacements,
		tagIds: input.tagIds,
		createdAt: pending.createdAt,
		updatedAt: pending.createdAt,
		createdBy: pending.userId
	};
}

/**
 * Da id a los acordes que aún no lo tienen. Sin conexión no hay servidor que se
 * los ponga, y la vista necesita uno para colocarlos sobre la letra.
 */
export function prepareChords(chords: SongChordInput[], createId: () => string): SongChord[] {
	return chords.map((chord) => ({
		id: typeof chord.id === 'string' ? chord.id : createId(),
		value: String(chord.value ?? '')
	}));
}

/**
 * Cuándo el service worker sirve la app guardada en vez de la respuesta: sin red
 * (eso lo decide él) o con el servidor caído o saturado. Un 404 o una redirección
 * al login son respuestas de verdad y se respetan.
 */
export function shouldServeShell(status: number): boolean {
	return status === 429 || status >= 500;
}
