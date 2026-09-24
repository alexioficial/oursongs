import { error } from '@sveltejs/kit';
import { getSong } from '$lib/server/songs';
import { listTags } from '$lib/server/tags';
import type { PageServerLoad } from './$types';

/**
 * La fecha se formatea aquí y no en el navegador: si cada lado la formateara en
 * su zona, el HTML del servidor y el del cliente no coincidirían. La zona sale
 * de la variable TZ del servidor.
 */
const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' });

export const load: PageServerLoad = async ({ params }) => {
	const [song, tags] = await Promise.all([getSong(params.id), listTags()]);
	if (!song) throw error(404, 'Esa canción no existe');
	return { song, tags, updatedAtLabel: dateFormat.format(new Date(song.updatedAt)) };
};
