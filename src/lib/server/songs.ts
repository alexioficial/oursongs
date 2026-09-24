import { ObjectId, type Db, type Filter } from 'mongodb';
import { getDb } from './db';
import { NotFoundError, ValidationError } from './errors';
import { escapeRegex } from './text';
import { resolveTagIds, toTagId } from './tags';
import { isValidChord, normalizeChord } from '$lib/music/chords';
import {
	ARTIST_MAX_LENGTH,
	LYRICS_MAX_LENGTH,
	MAX_CHORDS_PER_SONG,
	TITLE_MAX_LENGTH
} from '$lib/validation';
import type { Song, SongInput, SongSummary } from '$lib/types';

const SONGS_COLLECTION = 'songs';

export interface SongDoc {
	_id: ObjectId;
	title: string;
	artist?: string;
	/** La letra es un único string, con los saltos de línea normalizados. */
	lyrics: string;
	/** Un acorde por elemento, en forma canónica ('Am7', 'G#m7add11/D#'). */
	chords: string[];
	tagIds: ObjectId[];
	createdBy: ObjectId;
	createdAt: Date;
	updatedBy?: ObjectId;
	updatedAt: Date;
}

/** Lo que necesita la lista: sin la letra, que es lo único que abulta. */
type SongSummaryDoc = Omit<SongDoc, 'lyrics' | 'createdAt' | 'createdBy' | 'updatedBy'>;

const SUMMARY_PROJECTION = { title: 1, artist: 1, chords: 1, tagIds: 1, updatedAt: 1 } as const;

export function toSongSummary(doc: SongSummaryDoc): SongSummary {
	return {
		id: doc._id.toString(),
		title: doc.title,
		...(doc.artist && { artist: doc.artist }),
		chords: doc.chords ?? [],
		tagIds: (doc.tagIds ?? []).map((id) => id.toString()),
		updatedAt: doc.updatedAt.toISOString()
	};
}

export function toSong(doc: SongDoc): Song {
	return {
		...toSongSummary(doc),
		lyrics: doc.lyrics ?? '',
		createdAt: doc.createdAt.toISOString(),
		createdBy: doc.createdBy.toString(),
		...(doc.updatedBy && { updatedBy: doc.updatedBy.toString() })
	};
}

export function toSongId(id: unknown): ObjectId {
	if (typeof id !== 'string' || !ObjectId.isValid(id)) {
		throw new ValidationError('La canción indicada no es válida');
	}
	return new ObjectId(id);
}

function normalizeTitle(title: unknown): string {
	if (typeof title !== 'string') throw new ValidationError('El título es obligatorio');
	const clean = title.trim().replace(/\s+/g, ' ');
	if (!clean) throw new ValidationError('El título es obligatorio');
	if (clean.length > TITLE_MAX_LENGTH) {
		throw new ValidationError(`El título no puede pasar de ${TITLE_MAX_LENGTH} caracteres`);
	}
	return clean;
}

function normalizeArtist(artist: unknown): string | undefined {
	if (artist === undefined || artist === null) return undefined;
	if (typeof artist !== 'string') throw new ValidationError('El artista no es válido');
	const clean = artist.trim().replace(/\s+/g, ' ');
	if (!clean) return undefined;
	if (clean.length > ARTIST_MAX_LENGTH) {
		throw new ValidationError(`El artista no puede pasar de ${ARTIST_MAX_LENGTH} caracteres`);
	}
	return clean;
}

function normalizeLyrics(lyrics: unknown): string {
	if (lyrics === undefined || lyrics === null) return '';
	if (typeof lyrics !== 'string') throw new ValidationError('La letra no es válida');
	// Un textarea manda CRLF en Windows: lo dejamos todo en saltos simples para
	// que la letra se muestre y se cuente igual venga de donde venga.
	const clean = lyrics.replace(/\r\n?/g, '\n').trim();
	if (clean.length > LYRICS_MAX_LENGTH) {
		throw new ValidationError(`La letra no puede pasar de ${LYRICS_MAX_LENGTH} caracteres`);
	}
	return clean;
}

function normalizeChords(chords: unknown): string[] {
	if (chords === undefined || chords === null) return [];
	if (!Array.isArray(chords)) throw new ValidationError('Los acordes deben venir en una lista');
	if (chords.length > MAX_CHORDS_PER_SONG) {
		throw new ValidationError(`No se pueden guardar más de ${MAX_CHORDS_PER_SONG} acordes`);
	}

	return chords.map((chord) => {
		if (typeof chord !== 'string' || !isValidChord(chord)) {
			throw new ValidationError(`"${String(chord).slice(0, 24)}" no parece un acorde`);
		}
		return normalizeChord(chord);
	});
}

export interface SongQuery {
	search?: string;
	/** Filtra por las canciones que lleven TODOS estos tags. */
	tagIds?: string[];
}

export async function listSongs(query: SongQuery = {}): Promise<SongSummary[]> {
	const db: Db = await getDb();
	const filter: Filter<SongDoc> = {};

	const search = query.search?.trim();
	if (search) {
		const pattern = new RegExp(escapeRegex(search), 'i');
		filter.$or = [{ title: pattern }, { artist: pattern }];
	}

	if (query.tagIds?.length) {
		filter.tagIds = { $all: query.tagIds.map(toTagId) };
	}

	const docs = await db
		.collection<SongDoc>(SONGS_COLLECTION)
		.find(filter, { projection: SUMMARY_PROJECTION })
		.sort({ updatedAt: -1 })
		.toArray();

	return docs.map((doc) => toSongSummary(doc as SongSummaryDoc));
}

export async function getSong(id: string): Promise<Song | null> {
	if (typeof id !== 'string' || !ObjectId.isValid(id)) return null;
	const db: Db = await getDb();
	const doc = await db.collection<SongDoc>(SONGS_COLLECTION).findOne({ _id: new ObjectId(id) });
	return doc ? toSong(doc) : null;
}

export async function createSong(input: SongInput, userId: ObjectId): Promise<Song> {
	const now = new Date();
	const artist = normalizeArtist(input.artist);
	const doc = {
		title: normalizeTitle(input.title),
		...(artist && { artist }),
		lyrics: normalizeLyrics(input.lyrics),
		chords: normalizeChords(input.chords),
		tagIds: await resolveTagIds(input.tagIds),
		createdBy: userId,
		createdAt: now,
		updatedAt: now
	} as SongDoc;

	const db: Db = await getDb();
	const result = await db.collection<SongDoc>(SONGS_COLLECTION).insertOne(doc);
	return toSong({ ...doc, _id: result.insertedId });
}

/**
 * Actualiza solo los campos presentes en `patch`. El repertorio es compartido,
 * así que cualquier usuario con sesión puede editar cualquier canción; queda
 * registrado quién fue el último en `updatedBy`.
 */
export async function updateSong(id: string, patch: SongInput, userId: ObjectId): Promise<Song> {
	const songId = toSongId(id);
	const set: Partial<SongDoc> = {};
	const unset: Partial<Record<keyof SongDoc, ''>> = {};

	if (patch.title !== undefined) set.title = normalizeTitle(patch.title);
	if (patch.artist !== undefined) {
		const artist = normalizeArtist(patch.artist);
		if (artist) set.artist = artist;
		else unset.artist = '';
	}
	if (patch.lyrics !== undefined) set.lyrics = normalizeLyrics(patch.lyrics);
	if (patch.chords !== undefined) set.chords = normalizeChords(patch.chords);
	if (patch.tagIds !== undefined) set.tagIds = await resolveTagIds(patch.tagIds);

	if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
		throw new ValidationError('No hay nada que actualizar');
	}

	set.updatedAt = new Date();
	set.updatedBy = userId;

	const db: Db = await getDb();
	const updated = await db
		.collection<SongDoc>(SONGS_COLLECTION)
		.findOneAndUpdate(
			{ _id: songId },
			{ $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
			{ returnDocument: 'after' }
		);
	if (!updated) throw new NotFoundError('La canción no existe');
	return toSong(updated);
}

export async function deleteSong(id: string): Promise<void> {
	const songId = toSongId(id);
	const db: Db = await getDb();
	await db.collection<SongDoc>(SONGS_COLLECTION).deleteOne({ _id: songId });
}

/**
 * Deja un tag puesto exactamente en las canciones indicadas: es lo que usa la
 * pantalla de Tags para asignar desde el otro lado. Es idempotente.
 */
export async function setSongsForTag(
	tagId: string,
	songIds: unknown,
	userId: ObjectId
): Promise<number> {
	const tag = toTagId(tagId);
	if (!Array.isArray(songIds)) throw new ValidationError('Las canciones deben venir en una lista');
	const ids = [...new Set(songIds.map((value) => toSongId(value).toString()))].map(
		(value) => new ObjectId(value)
	);

	const db: Db = await getDb();
	const songs = db.collection<SongDoc>(SONGS_COLLECTION);
	const now = new Date();

	const [added, removed] = await Promise.all([
		songs.updateMany(
			{ _id: { $in: ids }, tagIds: { $ne: tag } },
			{ $addToSet: { tagIds: tag }, $set: { updatedAt: now, updatedBy: userId } }
		),
		songs.updateMany(
			{ _id: { $nin: ids }, tagIds: tag },
			{ $pull: { tagIds: tag }, $set: { updatedAt: now, updatedBy: userId } }
		)
	]);

	return added.modifiedCount + removed.modifiedCount;
}
