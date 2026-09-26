import { json, type RequestHandler } from '@sveltejs/kit';
import { formatUpdatedAt } from '$lib/server/dates';
import { NotFoundError } from '$lib/server/errors';
import { deleteSong, getSong, updateSong } from '$lib/server/songs';
import type { SongDetail } from '$lib/types';
import { failure, readObjectBody, requireUserId } from '$lib/server/apiHelpers';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const song = await getSong(params.id as string);
		if (!song) throw new NotFoundError('Esa canción no existe');
		return json({ song, updatedAtLabel: formatUpdatedAt(song.updatedAt) } satisfies SongDetail);
	} catch (error) {
		return failure(error);
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const userId = requireUserId(locals);
		const body = await readObjectBody(request);
		const song = await updateSong(params.id as string, body, userId);
		return json(song);
	} catch (error) {
		return failure(error);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await deleteSong(params.id as string);
		return json({ ok: true });
	} catch (error) {
		return failure(error);
	}
};
