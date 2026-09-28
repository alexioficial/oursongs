import { resolve } from '$app/paths';
import { loadSongPage } from '$lib/offline/songPage';
import type { PageLoad } from './$types';

/**
 * Solo en el navegador: la hoja depende de las opciones guardadas en el
 * dispositivo y de medir la fuente, y pintada en el servidor saldría primero con
 * las de por defecto y cambiaría de golpe. Sigue siendo una carga universal, así
 * que también se puede imprimir sin conexión.
 */
export const ssr = false;

export const load: PageLoad = (event) =>
	loadSongPage(event, (id) => resolve('/canciones/[id]/imprimir', { id }));
