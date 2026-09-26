import { json, type RequestHandler } from '@sveltejs/kit';
import { failure } from '$lib/server/apiHelpers';
import { formatUpdatedAt } from '$lib/server/dates';
import { listSongPage } from '$lib/server/songs';
import { listTags } from '$lib/server/tags';
import type { OfflineSongPage } from '$lib/types';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

/**
 * Descarga el repertorio entero por páginas para la copia sin conexión. Va por
 * páginas para que el cliente pueda enseñar el progreso real.
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const after = url.searchParams.get('after');
		const requested = Number(url.searchParams.get('limit')) || DEFAULT_PAGE_SIZE;
		const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE_SIZE);
		const [page, tags] = await Promise.all([
			listSongPage(after, limit),
			after ? Promise.resolve(undefined) : listTags()
		]);
		return json({
			songs: page.songs.map((song) => ({
				...song,
				updatedAtLabel: formatUpdatedAt(song.updatedAt)
			})),
			total: page.total,
			next: page.next,
			...(tags && { tags })
		} satisfies OfflineSongPage);
	} catch (error) {
		return failure(error);
	}
};
