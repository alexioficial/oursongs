import { json, type RequestHandler } from '@sveltejs/kit';
import type { SessionInfo } from '$lib/types';

/**
 * Quién es el usuario y qué tema usa. Es público (contesta `user: null` sin
 * sesión) porque lo pide el layout en todas las páginas, también en /login.
 */
export const GET: RequestHandler = async ({ locals }) => {
	return json({ user: locals.user, theme: locals.theme } satisfies SessionInfo);
};
