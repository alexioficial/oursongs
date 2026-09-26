import { json, type RequestHandler } from '@sveltejs/kit';
import { createSong, listSongs } from '$lib/server/songs';
import { failure, readObjectBody, requireUserId } from '$lib/server/apiHelpers';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const search = url.searchParams.get('q') ?? '';
		const tagIds = url.searchParams.getAll('tag');
		return json(await listSongs({ search, tagIds }));
	} catch (error) {
		return failure(error);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const userId = requireUserId(locals);
		const body = await readObjectBody(request);
		const song = await createSong(body, userId);
		return json(song, { status: 201 });
	} catch (error) {
		return failure(error);
	}
};
