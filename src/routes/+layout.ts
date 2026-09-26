import { browser } from '$app/environment';
import { apiGet, Unavailable } from '$lib/offline/load';
import { cachedUser, markUnreachable, rememberUser } from '$lib/offline/sync.svelte';
import { parseTheme, THEME_COOKIE } from '$lib/theme';
import type { SessionInfo } from '$lib/types';
import type { LayoutLoad } from './$types';

/**
 * Carga universal (no de servidor) a propósito: si el layout raíz tuviera una
 * carga de servidor, abrir la app sin red fallaría antes de llegar a la copia
 * local, porque SvelteKit tendría que pedir sus datos al servidor.
 */
export const load: LayoutLoad = async ({ fetch, url }) => {
	try {
		const session = await apiGet<SessionInfo>(fetch, '/api/session', url);
		if (browser) rememberUser(session.user);
		return session;
	} catch (error) {
		if (!(error instanceof Unavailable)) throw error;
		markUnreachable();
		// La app guardada trae el tema de cuando se guardó: manda la cookie.
		const cookie = document.cookie.split('; ').find((part) => part.startsWith(`${THEME_COOKIE}=`));
		const theme = parseTheme(cookie?.slice(THEME_COOKIE.length + 1));
		document.documentElement.dataset.theme = theme;
		return { user: cachedUser(), theme } satisfies SessionInfo;
	}
};
