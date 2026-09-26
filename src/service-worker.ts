/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Lo justo para abrir la app sin red: los archivos de la versión actual y la
 * "carcasa" (/app-shell), que arranca el enrutador en la URL pedida. Los datos
 * NO pasan por aquí: los guarda la app en IndexedDB (ver $lib/offline), así que
 * la API y los `__data.json` van siempre a la red y nunca salen de una caché
 * vieja.
 */
import { build, files, version } from '$service-worker';
import { shouldServeShell } from '$lib/offline/logic';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `oursongs-${version}`;
const ASSETS = [...build, ...files];
const SHELL = '/app-shell';

/**
 * La carcasa necesita sesión: si la petición acaba en el login (redirección),
 * no se guarda. Se pide al activarse y cada vez que la app entra con red, así
 * siempre corresponde a los archivos de esta versión.
 */
async function warmShell() {
	try {
		const response = await fetch(SHELL, { credentials: 'same-origin' });
		if (response.ok && !response.redirected) await (await caches.open(CACHE)).put(SHELL, response);
	} catch {
		// Sin red ahora mismo: se volverá a intentar en la próxima entrada.
	}
}

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await sw.clients.claim();
			await warmShell();
		})()
	);
});

async function shell(): Promise<Response | undefined> {
	return (await caches.open(CACHE)).match(SHELL);
}

async function navigate(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (shouldServeShell(response.status)) return (await shell()) ?? response;
		return response;
	} catch {
		return (await shell()) ?? Response.error();
	}
}

async function asset(request: Request): Promise<Response> {
	const cached = await (await caches.open(CACHE)).match(request);
	return cached ?? fetch(request);
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/api/') || url.pathname.endsWith('/__data.json')) return;

	if (request.mode === 'navigate') {
		event.respondWith(navigate(request));
	} else if (ASSETS.includes(url.pathname)) {
		event.respondWith(asset(request));
	}
});

sw.addEventListener('message', (event) => {
	const type = (event.data as { type?: unknown } | null)?.type;
	if (type === 'warm-shell') event.waitUntil(warmShell());
	if (type === 'forget-shell') {
		event.waitUntil(caches.open(CACHE).then((cache) => cache.delete(SHELL)));
	}
});
