import { error } from '@sveltejs/kit';
import { getSong } from '$lib/server/songs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const song = await getSong(params.id);
	if (!song) throw error(404, 'Esa canción no existe');
	return { song };
};
