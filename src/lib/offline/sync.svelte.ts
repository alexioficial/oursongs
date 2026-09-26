/**
 * Sincronización con el servidor para usar la app sin conexión.
 *
 * Al entrar (y cada vez que vuelve la red): primero se suben las canciones
 * creadas sin conexión y después se descarga el repertorio ENTERO a IndexedDB.
 * Sin red, las páginas de canciones leen de esa copia y solo se puede crear;
 * editar, borrar o alinear necesita al servidor.
 *
 * El estado vive en el navegador. En el servidor este módulo se importa (lo usan
 * las cargas universales) pero no se toca: sería estado compartido entre
 * usuarios.
 */
import { browser } from '$app/environment';
import { invalidateAll } from '$app/navigation';
import type { OfflineSong, OfflineSongPage, SessionUser, Song, Tag } from '$lib/types';
import * as local from './db';
import { nowIso, type PendingSong, type PendingSongInput } from './logic';

export type SyncPhase = 'idle' | 'uploading' | 'downloading' | 'done' | 'offline' | 'error';

/** ¿Responde el servidor? No basta `navigator.onLine`: puede haber red y no servidor. */
export const connection = $state({ online: true });

export const sync = $state({
	phase: 'idle' as SyncPhase,
	done: 0,
	total: 0,
	message: null as string | null
});

export const pending = $state({
	songs: [] as PendingSong[],
	/** clientId → id real, para saltar a la canción de verdad cuando se sube. */
	synced: {} as Record<string, string>
});

const USER_KEY = 'oursongs:user';
const PAGE_SIZE = 100;
const RETRY_MS = 30_000;

let userId: string | null = null;
let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** El servidor no contesta (sin red, caído o saturado): se reintenta luego. */
class Unreachable extends Error {}

class SessionExpired extends Error {
	constructor() {
		super('Tu sesión caducó. Vuelve a entrar para sincronizar.');
	}
}

/**
 * Sin red no se puede preguntar quién es el usuario: se recuerda el último. Se
 * borra al cerrar sesión o cuando el servidor dice que no hay sesión.
 */
export function rememberUser(user: SessionUser | null) {
	try {
		if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
		else localStorage.removeItem(USER_KEY);
	} catch {
		// Sin almacenamiento, simplemente no habrá modo sin conexión.
	}
}

export function cachedUser(): SessionUser | null {
	try {
		const raw = localStorage.getItem(USER_KEY);
		return raw ? (JSON.parse(raw) as SessionUser) : null;
	} catch {
		return null;
	}
}

function scheduleRetry() {
	clearTimeout(retryTimer);
	// Con `navigator.onLine` en falso ya avisará el evento 'online'; esto cubre
	// el caso de red sin servidor, que no dispara ningún evento.
	if (navigator.onLine) retryTimer = setTimeout(() => void synchronize(), RETRY_MS);
}

/** Lo llaman las cargas cuando tiran de la copia local porque el servidor no respondió. */
export function markUnreachable() {
	if (!browser) return;
	connection.online = false;
	// Una carga que falla mientras se sincroniza no pisa la barra: de eso se
	// encarga la propia sincronización cuando falle.
	if (!running) sync.phase = 'offline';
	scheduleRetry();
}

export function startOffline(user: SessionUser) {
	if (!browser || userId === user.id) return;
	const firstStart = userId === null;
	userId = user.id;
	if (firstStart) {
		window.addEventListener('online', () => void synchronize());
		window.addEventListener('offline', () => markUnreachable());
	}
	warmShell();
	void refreshPending().then(() => synchronize());
}

/** Pide al service worker que guarde la app para poder abrirla sin red. */
function warmShell() {
	navigator.serviceWorker?.ready
		.then((registration) => registration.active?.postMessage({ type: 'warm-shell' }))
		.catch(() => {
			// Sin service worker la app funciona igual; solo no abrirá sin red.
		});
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(path, {
			...init,
			headers: { accept: 'application/json', ...init.headers }
		});
	} catch {
		throw new Unreachable();
	}
	if (response.status === 429 || response.status >= 500) throw new Unreachable();
	if (response.status === 401) throw new SessionExpired();
	connection.online = true;
	return response;
}

async function refreshPending() {
	const all = await local.readPending();
	pending.songs = all
		.filter((song) => song.userId === userId)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Sube lo creado sin conexión. Devuelve si subió algo. */
async function uploadPending(): Promise<boolean> {
	const queue = $state.snapshot(pending.songs).filter((song) => !song.error);
	if (queue.length === 0) return false;

	sync.phase = 'uploading';
	sync.done = 0;
	sync.total = queue.length;

	// Un tag borrado mientras tanto haría rechazar la canción entera: se quita.
	const tagsResponse = await call('/api/tags');
	const knownTags = tagsResponse.ok
		? ((await tagsResponse.json()) as Tag[]).map(({ id }) => id)
		: null;

	let uploaded = false;
	for (const song of queue) {
		const tagIds = knownTags
			? song.input.tagIds.filter((id) => knownTags.includes(id))
			: song.input.tagIds;
		const response = await call('/api/songs', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...song.input, tagIds, clientId: song.clientId })
		});
		if (response.ok) {
			const created = (await response.json()) as Song;
			await local.deletePending(song.clientId);
			pending.synced[song.clientId] = created.id;
			uploaded = true;
		} else {
			// Un 4xx no se arregla reintentando: se marca y decide el usuario.
			const body = (await response.json().catch(() => ({}))) as { error?: unknown };
			await local.putPending({
				...song,
				error: typeof body.error === 'string' ? body.error : 'El servidor rechazó la canción'
			});
		}
		sync.done++;
	}
	await refreshPending();
	return uploaded;
}

async function downloadAll() {
	sync.phase = 'downloading';
	sync.done = 0;
	sync.total = 0;

	const songs: OfflineSong[] = [];
	let tags: Tag[] = [];
	let after: string | null = null;
	do {
		const query: string = after ? `&after=${encodeURIComponent(after)}` : '';
		const response = await call(`/api/offline/songs?limit=${PAGE_SIZE}${query}`);
		if (!response.ok) throw new Error('No se pudieron descargar las canciones');
		const page = (await response.json()) as OfflineSongPage;
		if (page.tags) tags = page.tags;
		songs.push(...page.songs);
		sync.total = Math.max(page.total, songs.length);
		sync.done = songs.length;
		after = page.next;
	} while (after);

	await local.replaceSnapshot(songs, tags);
}

async function run() {
	clearTimeout(retryTimer);
	if (!navigator.onLine) {
		markUnreachable();
		return;
	}
	try {
		// Primero subir: así la descarga ya trae las canciones recién creadas.
		if (await uploadPending()) await invalidateAll();
		await downloadAll();
		sync.phase = 'done';
		sync.message = null;
	} catch (error) {
		if (error instanceof Unreachable) {
			connection.online = false;
			sync.phase = 'offline';
			scheduleRetry();
		} else {
			sync.phase = 'error';
			sync.message = error instanceof Error ? error.message : 'No se pudo sincronizar';
		}
	}
}

/** Sube lo pendiente y descarga todo. Si ya está en marcha, espera a esa. */
export function synchronize(): Promise<void> {
	if (!browser || !userId) return Promise.resolve();
	running ??= run().finally(() => {
		running = null;
	});
	return running;
}

/** Guarda una canción creada sin conexión; se sube sola cuando haya red. */
export async function savePendingSong(
	clientId: string,
	input: PendingSongInput
): Promise<PendingSong> {
	if (!userId) throw new Error('Necesitas iniciar sesión');
	const song: PendingSong = {
		clientId,
		userId,
		createdAt: nowIso(),
		input: $state.snapshot(input)
	};
	await local.putPending(song);
	await refreshPending();
	void synchronize();
	return song;
}

export async function discardPendingSong(clientId: string) {
	await local.deletePending(clientId);
	await refreshPending();
}

export async function retryPendingSong(clientId: string) {
	const song = await local.readPendingSong(clientId);
	if (!song) return;
	delete song.error;
	await local.putPending(song);
	await refreshPending();
	await synchronize();
}

/** Al cerrar sesión: fuera la copia, lo pendiente y la app guardada. */
export async function clearOfflineData() {
	if (!browser) return;
	userId = null;
	clearTimeout(retryTimer);
	rememberUser(null);
	pending.songs = [];
	await local.clearAll().catch(() => {
		// Si IndexedDB falla aquí, no hay nada más que hacer.
	});
	navigator.serviceWorker?.controller?.postMessage({ type: 'forget-shell' });
}
