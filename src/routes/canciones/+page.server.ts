import { listSongs } from '$lib/server/songs';
import { listTags } from '$lib/server/tags';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q')?.trim() ?? '';
	const tags = await listTags();

	// Un tag de la URL que ya no existe se ignora: un enlace viejo sigue abriendo
	// la lista en vez de dar error.
	const known = new Set(tags.map((tag) => tag.id));
	const tagIds = url.searchParams.getAll('tag').filter((id) => known.has(id));

	return { songs: await listSongs({ search, tagIds }), tags, search, tagIds };
};
