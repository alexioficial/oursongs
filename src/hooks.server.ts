import { json, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getUserBySessionToken, SESSION_COOKIE } from '$lib/server/session';
import { toSessionUser } from '$lib/server/users';
import { parseTheme, THEME_COOKIE } from '$lib/theme';

/**
 * Lo único alcanzable sin sesión. /api/health entra aquí porque el healthcheck
 * del contenedor no tiene cookie con la que identificarse.
 */
const PUBLIC_ROUTES = new Set(['/login', '/api/auth/login', '/api/health']);

const sessionHandle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = null;

	if (token) {
		try {
			const user = await getUserBySessionToken(token);
			if (user) event.locals.user = toSessionUser(user);
			// Cookie con una sesión que ya no existe: la borramos para no volver a
			// consultar la base en cada petición.
			else event.cookies.delete(SESSION_COOKIE, { path: '/' });
		} catch (error) {
			console.error('Error al recuperar la sesión:', error);
		}
	}

	return resolve(event);
};

/**
 * El tema se escribe en el `<html>` desde el servidor (ver app.html) para que la
 * primera pintura ya salga con el tema elegido, sin parpadeo.
 */
const themeHandle: Handle = async ({ event, resolve }) => {
	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	event.locals.theme = theme;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%oursongs.theme%', theme)
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (!event.locals.user && !PUBLIC_ROUTES.has(path)) {
		// La API contesta 401 en vez de un redirect: un fetch seguiría el redirect
		// y el cliente recibiría el HTML del login en lugar de un error claro.
		if (path.startsWith('/api/')) {
			return json({ error: 'Necesitas iniciar sesión' }, { status: 401 });
		}
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(path + event.url.search)}`);
	}

	if (event.locals.user && path === '/login') throw redirect(303, '/canciones');

	return resolve(event);
};

// 'unsafe-inline' en script-src lo pide la hidratación de Svelte; el resto se
// queda en el propio origen porque la app no carga nada de fuera.
const CSP_DIRECTIVES = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'"
].join('; ');

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	if (!response.headers.has('Referrer-Policy')) {
		response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	}
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=()'
	);
	response.headers.set('Content-Security-Policy', CSP_DIRECTIVES);

	if (process.env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

// El guard necesita la sesión ya resuelta, y va dentro de securityHeaders para
// que incluso sus 401 y sus redirects salgan con las cabeceras puestas.
export const handle: Handle = sequence(sessionHandle, themeHandle, securityHeaders, authGuard);
