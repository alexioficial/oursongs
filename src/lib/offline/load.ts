/**
 * Lectura de la API desde las cargas universales. En el servidor la llamada es
 * interna y no puede fallar por red; en el navegador, si el servidor no
 * responde, se lanza `Unavailable` y la carga tira de la copia local.
 */
import { browser } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { shouldServeShell } from './logic';

export class Unavailable extends Error {}

export async function apiGet<T>(fetchFn: typeof fetch, path: string, from: URL): Promise<T> {
	let response: Response;
	try {
		response = await fetchFn(path, { headers: { accept: 'application/json' } });
	} catch (cause) {
		if (browser) throw new Unavailable();
		throw cause;
	}
	if (browser && shouldServeShell(response.status)) throw new Unavailable();
	if (response.status === 401) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(from.pathname + from.search)}`);
	}
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { error?: unknown };
		error(response.status, typeof body.error === 'string' ? body.error : 'Algo salió mal');
	}
	return (await response.json()) as T;
}
