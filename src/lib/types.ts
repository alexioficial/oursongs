/**
 * Tipos que cruzan del servidor al cliente. Los `_id` de Mongo y las fechas ya
 * vienen convertidos a string, así que un `load` puede devolverlos tal cual.
 */

export interface SessionUser {
	id: string;
	username: string;
	name?: string;
}

export interface Tag {
	id: string;
	name: string;
	slug: string;
}

/** Tag con el número de canciones que lo llevan (pantalla de Tags). */
export interface TagWithCount extends Tag {
	songCount: number;
}

export interface SongChord {
	id: string;
	value: string;
}

export interface SongChordInput {
	id?: unknown;
	value?: unknown;
}

export interface ChordPlacement {
	chordId: string;
	offset: number;
}

export interface SongSummary {
	id: string;
	title: string;
	artist?: string;
	rhythm?: string;
	/** Acordes tal como se guardaron: transponer es solo cosa de la vista. */
	chords: SongChord[];
	tagIds: string[];
	updatedAt: string;
}

export interface Song extends SongSummary {
	lyrics: string;
	chordPlacements: ChordPlacement[];
	createdAt: string;
	createdBy: string;
	updatedBy?: string;
}

/**
 * Lo que llega del cliente al crear o editar una canción: todavía sin validar,
 * así que cada campo es `unknown` y son los normalizadores del servidor los que
 * deciden si vale.
 */
export interface SongInput {
	title?: unknown;
	artist?: unknown;
	rhythm?: unknown;
	lyrics?: unknown;
	chords?: unknown;
	chordPlacements?: unknown;
	tagIds?: unknown;
	/** UUID del cliente: repetir el alta con el mismo no crea otra canción. */
	clientId?: unknown;
}

/** La ficha de una canción, con la fecha ya formateada en el servidor. */
export interface SongDetail {
	song: Song;
	updatedAtLabel: string;
}

/** Lo que se guarda en el dispositivo para verla sin conexión. */
export interface OfflineSong extends Song {
	updatedAtLabel: string;
}

export interface OfflineSongPage {
	songs: OfflineSong[];
	total: number;
	next: string | null;
	/** Solo en la primera página. */
	tags?: Tag[];
}

export interface SessionInfo {
	user: SessionUser | null;
	theme: 'light' | 'dark';
}
