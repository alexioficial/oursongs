import { json, type RequestHandler } from '@sveltejs/kit';
import { createTag, listTags } from '$lib/server/tags';
import { failure, readObjectBody, requireUserId } from '$lib/server/apiHelpers';

export const GET: RequestHandler = async () => {
	try {
		return json(await listTags());
	} catch (error) {
		return failure(error);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const userId = requireUserId(locals);
		const body = await readObjectBody(request);
		const tag = await createTag(body.name, userId);
		return json(tag, { status: 201 });
	} catch (error) {
		return failure(error);
	}
};
