import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteSong, updateSong } from '$lib/server/songs';
import { failure, readObjectBody, requireUserId } from '$lib/server/apiHelpers';

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
