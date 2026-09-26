import { browser } from '$app/environment';
import { resolve } from '$app/paths';
import { error, isHttpError, redirect } from '@sveltejs/kit';
import { readPendingSong, readSong, readTags } from '$lib/offline/db';
import { apiGet, Unavailable } from '$lib/offline/load';
import { pendingToSong, type PendingSong } from '$lib/offline/logic';
import { markUnreachable, pending as pendingState } from '$lib/offline/sync.svelte';
import type { Song, SongDetail, Tag } from '$lib/types';
import type { PageLoad } from './$types';

interface SongPageData {
	song: Song;
	updatedAtLabel: string;
	tags: Tag[];
	/** Creada sin conexión y aún sin subir (solo en el navegador). */
	pending: PendingSong | null;
	offline: boolean;
}

export const load: PageLoad = async ({ fetch, params, url, parent }): Promise<SongPageData> => {
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

		// Era una canción creada sin conexión que ya se subió: su id local ya no
		// existe en ningún lado, así que se salta a la de verdad.
		const uploadedAs = pendingState.synced[params.id];
		if (uploadedAs) redirect(307, resolve('/canciones/[id]', { id: uploadedAs }));

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
};
