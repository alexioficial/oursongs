/**
 * Enciende o apaga el modo sin conexión según el origen (ver `isOfflineOrigin`).
 * Solo en el navegador: lo llama `hooks.client.ts` al arrancar y lo consultan
 * quienes usarían la copia local.
 */
import { browser, dev } from '$app/environment';
import { isOfflineOrigin } from './logic';

const DB_NAME = 'oursongs';
const CACHE_PREFIX = 'oursongs-';
// La misma clave que escribe sync.svelte.ts; aquí no se importa ese módulo para
// no arrastrar su estado al arranque. 'oursongs:logout-pending' se deja: es una
// orden de cerrar sesión que aún no llegó al servidor, no una copia de datos.
const STORAGE_KEYS = ['oursongs:user'];

/** En el servidor siempre es falso: el modo sin conexión es cosa del navegador. */
export const offlineEnabled = (): boolean => browser && isOfflineOrigin(location);

/** Registra el service worker. SvelteKit no lo hace solo (`serviceWorker.register: false`). */
function enable() {
	navigator.serviceWorker
		?.register('/service-worker.js', { type: dev ? 'module' : 'classic' })
		.catch(() => {
			// Sin service worker la app funciona igual; solo no abrirá sin red.
		});
}

/**
 * Quita lo que una visita anterior (cuando esto aún se registraba en cualquier
 * sitio) dejó en este origen: si no, seguiría ahí estorbando a otro proyecto que
 * use el mismo `localhost:puerto`. Solo toca lo que es de esta app.
 */
async function disable() {
	try {
		for (const key of STORAGE_KEYS) localStorage.removeItem(key);
	} catch {
		// Sin almacenamiento no hay nada que quitar.
	}

	await Promise.allSettled([
		navigator.serviceWorker
			?.getRegistrations()
			.then((registrations) =>
				Promise.all(
					registrations
						.filter(({ active, waiting, installing }) =>
							[active, waiting, installing].some(
								(worker) => worker && new URL(worker.scriptURL).pathname === '/service-worker.js'
							)
						)
						.map((registration) => registration.unregister())
				)
			),
		globalThis.caches
			?.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
				)
			),
		new Promise<void>((resolve) => {
			// Si otra pestaña la tiene abierta, el borrado espera a que la cierre.
			const request = indexedDB.deleteDatabase(DB_NAME);
			request.onsuccess = request.onerror = request.onblocked = () => resolve();
		})
	]);
}

export function setupOffline() {
	if (!browser) return;
	if (offlineEnabled()) enable();
	else void disable();
}
