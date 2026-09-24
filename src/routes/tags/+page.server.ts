import { listSongs } from '$lib/server/songs';
import { listTagsWithCounts } from '$lib/server/tags';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Las canciones vienen enteras (sin letra) porque desde aquí se asigna el tag
	// a varias de golpe.
	const [tags, songs] = await Promise.all([listTagsWithCounts(), listSongs()]);
	return { tags, songs };
};
