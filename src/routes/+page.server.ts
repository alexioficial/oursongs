import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// La raíz no tiene contenido propio: la app empieza en Canciones.
export const load: PageServerLoad = async () => {
	throw redirect(307, '/canciones');
};
