import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteSession, SESSION_COOKIE } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	if (token)
		await deleteSession(token).catch((error) => console.error('Error al cerrar sesión:', error));
	return json({ ok: true });
};
