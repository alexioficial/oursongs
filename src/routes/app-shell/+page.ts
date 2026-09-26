import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * La "carcasa" de la app para abrirla sin red: con `ssr = false` el servidor
 * devuelve un HTML sin datos que arranca el enrutador en la URL que se pidió.
 * El service worker la guarda y la sirve para cualquier página cuando no hay
 * servidor. Visitada directamente, no tiene nada que enseñar.
 */
export const ssr = false;

export const load: PageLoad = () => {
	redirect(307, '/canciones');
};
