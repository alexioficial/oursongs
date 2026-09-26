/**
 * La copia del repertorio en el dispositivo (IndexedDB). Solo funciona en el
 * navegador; quien la usa ya lo comprueba antes con `browser`.
 */
import type { OfflineSong, Tag } from '$lib/types';
import type { PendingSong } from './logic';

const DB_NAME = 'oursongs';
const DB_VERSION = 1;
const SONGS = 'songs';
const TAGS = 'tags';
const PENDING = 'pending';
const META = 'meta';

type StoreName = typeof SONGS | typeof TAGS | typeof PENDING | typeof META;

interface SyncMeta {
	key: 'sync';
	syncedAt: string;
}

// Una sola conexión para toda la vida de la página.
let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
	opening ??= new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			db.createObjectStore(SONGS, { keyPath: 'id' });
			db.createObjectStore(TAGS, { keyPath: 'id' });
			db.createObjectStore(PENDING, { keyPath: 'clientId' });
			db.createObjectStore(META, { keyPath: 'key' });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => {
			opening = null;
			reject(request.error ?? new Error('No se pudo abrir el almacenamiento local'));
		};
	});
	return opening;
}

function done(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = transaction.onerror = () =>
			reject(transaction.error ?? new Error('Falló el almacenamiento local'));
	});
}

async function readAll<T>(store: StoreName): Promise<T[]> {
	const tx = (await database()).transaction(store, 'readonly');
	const request = tx.objectStore(store).getAll();
	await done(tx);
	return request.result as T[];
}

async function readOne<T>(store: StoreName, key: string): Promise<T | undefined> {
	const tx = (await database()).transaction(store, 'readonly');
	const request = tx.objectStore(store).get(key);
	await done(tx);
	return request.result as T | undefined;
}

export const readSongs = () => readAll<OfflineSong>(SONGS);
export const readSong = (id: string) => readOne<OfflineSong>(SONGS, id);
export const readTags = () => readAll<Tag>(TAGS);
export const readPending = () => readAll<PendingSong>(PENDING);
export const readPendingSong = (clientId: string) => readOne<PendingSong>(PENDING, clientId);

export async function readSyncedAt(): Promise<string | null> {
	return (await readOne<SyncMeta>(META, 'sync'))?.syncedAt ?? null;
}

/**
 * Cambia la copia entera de golpe, en una sola transacción: si la descarga se
 * corta a medias, lo guardado sigue siendo la copia anterior completa, no una
 * mezcla.
 */
export async function replaceSnapshot(songs: OfflineSong[], tags: Tag[]): Promise<void> {
	const tx = (await database()).transaction([SONGS, TAGS, META], 'readwrite');
	const songStore = tx.objectStore(SONGS);
	const tagStore = tx.objectStore(TAGS);
	songStore.clear();
	tagStore.clear();
	for (const song of songs) songStore.put(song);
	for (const tag of tags) tagStore.put(tag);
	tx.objectStore(META).put({ key: 'sync', syncedAt: new Date().toISOString() } satisfies SyncMeta);
	await done(tx);
}

export async function putPending(song: PendingSong): Promise<void> {
	const tx = (await database()).transaction(PENDING, 'readwrite');
	tx.objectStore(PENDING).put(song);
	await done(tx);
}

export async function deletePending(clientId: string): Promise<void> {
	const tx = (await database()).transaction(PENDING, 'readwrite');
	tx.objectStore(PENDING).delete(clientId);
	await done(tx);
}

/** Al cerrar sesión: el dispositivo no se queda con nada. */
export async function clearAll(): Promise<void> {
	const stores = [SONGS, TAGS, PENDING, META];
	const tx = (await database()).transaction(stores, 'readwrite');
	for (const store of stores) tx.objectStore(store).clear();
	await done(tx);
}
