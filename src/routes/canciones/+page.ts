import { redirect } from '@sveltejs/kit';
import { readSongs, readTags } from '$lib/offline/db';
import { apiGet, Unavailable } from '$lib/offline/load';
import { filterSongs, toSummary } from '$lib/offline/logic';
import { markUnreachable } from '$lib/offline/sync.svelte';
import type { SongSummary, Tag } from '$lib/types';
import type { PageLoad } from './$types';

/** Con red, de la API; sin ella, de la copia del dispositivo, con la misma búsqueda. */
export const load: PageLoad = async ({ fetch, url, parent }) => {
	const search = url.searchParams.get('q')?.trim() ?? '';
	const requested = url.searchParams.getAll('tag');
	// Un tag de la URL que ya no existe se ignora: un enlace viejo sigue abriendo
	// la lista en vez de dar error.
	const knownOf = (tags: Tag[]) => requested.filter((id) => tags.some((tag) => tag.id === id));

	try {
		const tags = await apiGet<Tag[]>(fetch, '/api/tags', url);
		const tagIds = knownOf(tags);
		const query = [
			...(search ? [`q=${encodeURIComponent(search)}`] : []),
			...tagIds.map((id) => `tag=${encodeURIComponent(id)}`)
		].join('&');
		const songs = await apiGet<SongSummary[]>(fetch, `/api/songs?${query}`, url);
		return { songs, tags, search, tagIds, offline: false };
	} catch (error) {
		if (!(error instanceof Unavailable)) throw error;
		markUnreachable();
		if (!(await parent()).user) redirect(303, '/login');

		const [songs, stored] = await Promise.all([readSongs(), readTags()]);
		const tags = stored.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
		const tagIds = knownOf(tags);
		return {
			songs: filterSongs(songs.map(toSummary), search, tagIds),
			tags,
			search,
			tagIds,
			offline: true
		};
	}
};
