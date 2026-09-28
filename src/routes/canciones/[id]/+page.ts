import { resolve } from '$app/paths';
import { loadSongPage } from '$lib/offline/songPage';
import type { PageLoad } from './$types';

export const load: PageLoad = (event) =>
	loadSongPage(event, (id) => resolve('/canciones/[id]', { id }));
