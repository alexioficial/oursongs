import { dev } from '$app/environment';
import { json, type RequestHandler } from '@sveltejs/kit';
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '$lib/server/session';
import { toSessionUser, verifyCredentials } from '$lib/server/users';
import { failure, readObjectBody } from '$lib/server/apiHelpers';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await readObjectBody(request);
		const username = typeof body.username === 'string' ? body.username.trim() : '';
		const password = typeof body.password === 'string' ? body.password : '';

		if (!username || !password) {
			return json({ error: 'Escribe tu usuario y tu contraseña' }, { status: 400 });
		}

		const user = await verifyCredentials(username, password);
		// Un único mensaje para usuario inexistente y contraseña incorrecta.
		if (!user) return json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });

		const token = await createSession(user._id);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: SESSION_MAX_AGE_SECONDS
		});

		return json(toSessionUser(user));
	} catch (error) {
		return failure(error);
	}
};
