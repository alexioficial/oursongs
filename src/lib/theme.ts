/**
 * Tema claro/oscuro. Se guarda en una cookie y no en localStorage porque el
 * servidor tiene que saberlo al pintar el HTML: si lo decidiera el cliente, la
 * página cargaría un instante con el tema equivocado.
 */

export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'theme';

/** La app nació oscura: sin preferencia guardada se queda así. */
export const DEFAULT_THEME: Theme = 'dark';

export function parseTheme(value: string | undefined | null): Theme {
	return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
}
