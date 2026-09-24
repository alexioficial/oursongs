import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteTag, renameTag } from '$lib/server/tags';
import { failure, readObjectBody } from '$lib/server/apiHelpers';

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await readObjectBody(request);
		const tag = await renameTag(params.id as string, body.name);
		return json(tag);
	} catch (error) {
		return failure(error);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		// Borrar un tag lo quita también de las canciones que lo llevaban.
		await deleteTag(params.id as string);
		return json({ ok: true });
	} catch (error) {
		return failure(error);
	}
};
