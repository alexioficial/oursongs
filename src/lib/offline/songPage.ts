/**
 * Carga de una canción para las pantallas que tienen que verse sin conexión (la
 * ficha y la hoja para imprimir): con red, de la API; sin ella, de la copia del
 * dispositivo o de lo creado aquí y aún sin subir.
 */
import { browser } from '$app/environment';
import { error, isHttpError, redirect } from '@sveltejs/kit';
import { readPendingSong, readSong, readTags } from './db';
import { apiGet, Unavailable } from './load';
import { pendingToSong, type PendingSong } from './logic';
import { markUnreachable, pending as pendingState } from './sync.svelte';
import type { SessionUser, Song, SongDetail, Tag } from '$lib/types';

export interface SongPageData {
	song: Song;
	updatedAtLabel: string;
	tags: Tag[];
	/** Creada sin conexión y aún sin subir (solo en el navegador). */
	pending: PendingSong | null;
	offline: boolean;
}

interface SongLoadEvent {
	fetch: typeof fetch;
	params: { id: string };
	url: URL;
	parent: () => Promise<{ user: SessionUser | null }>;
}

/**
 * `pathFor` es a dónde saltar cuando la canción se creó sin conexión y ya se
 * subió: su id local ya no existe en ningún lado y hay que ir a la de verdad,
 * en la misma pantalla.
 */
export async function loadSongPage(
	{ fetch, params, url, parent }: SongLoadEvent,
	pathFor: (id: string) => string
): Promise<SongPageData> {
	try {
		const [detail, tags] = await Promise.all([
			apiGet<SongDetail>(fetch, `/api/songs/${encodeURIComponent(params.id)}`, url),
			apiGet<Tag[]>(fetch, '/api/tags', url)
		]);
		return { ...detail, tags, pending: null, offline: false };
	} catch (caught) {
		const unavailable = caught instanceof Unavailable;
		// Un 404 del servidor puede ser una canción creada aquí que aún no subió.
		if (!browser || (!unavailable && !isHttpError(caught, 404))) throw caught;
		if (unavailable) {
			markUnreachable();
			if (!(await parent()).user) redirect(303, '/login');
		}

		const uploadedAs = pendingState.synced[params.id];
		if (uploadedAs) redirect(307, pathFor(uploadedAs));

		const [pending, tags] = await Promise.all([readPendingSong(params.id), readTags()]);
		if (pending) {
			return {
				song: pendingToSong(pending),
				updatedAtLabel: '',
				tags,
				pending,
				offline: unavailable
			};
		}
		if (!unavailable) throw caught;

		const stored = await readSong(params.id);
		if (!stored) error(404, 'Esa canción no está guardada en este dispositivo');
		const { updatedAtLabel, ...song } = stored;
		return { song, updatedAtLabel, tags, pending: null, offline: true };
	}
}
