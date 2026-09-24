import { json, type RequestHandler } from '@sveltejs/kit';
import { setSongsForTag } from '$lib/server/songs';
import { failure, readObjectBody, requireUserId } from '$lib/server/apiHelpers';

/** Deja el tag puesto exactamente en las canciones que lleguen en `songIds`. */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	try {
		const userId = requireUserId(locals);
		const body = await readObjectBody(request);
		const changed = await setSongsForTag(params.id as string, body.songIds, userId);
		return json({ ok: true, changed });
	} catch (error) {
		return failure(error);
	}
};
