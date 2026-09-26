import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// La raíz no tiene contenido propio: la app empieza en Canciones. Es universal
// para que también funcione sin conexión.
export const load: PageLoad = () => {
	redirect(307, '/canciones');
};
