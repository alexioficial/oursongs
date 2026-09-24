import { ObjectId, type Db } from 'mongodb';
import { CI_COLLATION, getDb } from './db';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { isDuplicateKeyError } from './users';
import { slugify } from './text';
import { TAG_NAME_MAX_LENGTH } from '$lib/validation';
import type { SongDoc } from './songs';
import type { Tag, TagWithCount } from '$lib/types';

const TAGS_COLLECTION = 'tags';
const SONGS_COLLECTION = 'songs';

export interface TagDoc {
	_id: ObjectId;
	name: string;
	slug: string;
	createdBy: ObjectId;
	createdAt: Date;
	updatedAt?: Date;
}

export class TagNameTakenError extends ConflictError {
	constructor() {
		super('Ya existe un tag con ese nombre');
	}
}

export function toTag(doc: TagDoc): Tag {
	return { id: doc._id.toString(), name: doc.name, slug: doc.slug };
}

function normalizeTagName(name: unknown): string {
	if (typeof name !== 'string') throw new ValidationError('El nombre del tag es obligatorio');
	const clean = name.trim().replace(/\s+/g, ' ');
	if (!clean) throw new ValidationError('El nombre del tag es obligatorio');
	if (clean.length > TAG_NAME_MAX_LENGTH) {
		throw new ValidationError(`El nombre no puede pasar de ${TAG_NAME_MAX_LENGTH} caracteres`);
	}
	if (!slugify(clean))
		throw new ValidationError('El nombre del tag necesita alguna letra o número');
	return clean;
}

export async function listTags(): Promise<Tag[]> {
	const db: Db = await getDb();
	const docs = await db
		.collection<TagDoc>(TAGS_COLLECTION)
		.find({})
		.collation(CI_COLLATION)
		.sort({ name: 1 })
		.toArray();
	return docs.map(toTag);
}

/** Los tags con cuántas canciones lleva cada uno (pantalla de Tags). */
export async function listTagsWithCounts(): Promise<TagWithCount[]> {
	const db: Db = await getDb();
	const [tags, counts] = await Promise.all([
		listTags(),
		db
			.collection(SONGS_COLLECTION)
			.aggregate<{ _id: ObjectId; count: number }>([
				{ $unwind: '$tagIds' },
				{ $group: { _id: '$tagIds', count: { $sum: 1 } } }
			])
			.toArray()
	]);

	const byId = new Map(counts.map((row) => [row._id.toString(), row.count]));
	return tags.map((tag) => ({ ...tag, songCount: byId.get(tag.id) ?? 0 }));
}

export async function createTag(name: unknown, userId: ObjectId): Promise<Tag> {
	const clean = normalizeTagName(name);
	const db: Db = await getDb();
	const doc = {
		name: clean,
		slug: slugify(clean),
		createdBy: userId,
		createdAt: new Date()
	} as TagDoc;

	try {
		const result = await db.collection<TagDoc>(TAGS_COLLECTION).insertOne(doc);
		return toTag({ ...doc, _id: result.insertedId });
	} catch (error) {
		// El índice único (con collation y sobre el slug) es quien decide: así dos
		// peticiones simultáneas no crean 'Rock' y 'rock'.
		if (isDuplicateKeyError(error)) throw new TagNameTakenError();
		throw error;
	}
}

export async function renameTag(id: string, name: unknown): Promise<Tag> {
	const tagId = toTagId(id);
	const clean = normalizeTagName(name);
	const db: Db = await getDb();

	try {
		const updated = await db
			.collection<TagDoc>(TAGS_COLLECTION)
			.findOneAndUpdate(
				{ _id: tagId },
				{ $set: { name: clean, slug: slugify(clean), updatedAt: new Date() } },
				{ returnDocument: 'after' }
			);
		if (!updated) throw new NotFoundError('El tag no existe');
		return toTag(updated);
	} catch (error) {
		if (isDuplicateKeyError(error)) throw new TagNameTakenError();
		throw error;
	}
}

/**
 * Borra el tag y lo quita de las canciones que lo llevaban. El orden importa:
 * si fallara el segundo paso preferimos un tag sin canciones (inofensivo) a
 * canciones apuntando a un tag que ya no existe.
 */
export async function deleteTag(id: string): Promise<void> {
	const tagId = toTagId(id);
	const db: Db = await getDb();
	await db
		.collection<SongDoc>(SONGS_COLLECTION)
		.updateMany({ tagIds: tagId }, { $pull: { tagIds: tagId } });
	await db.collection<TagDoc>(TAGS_COLLECTION).deleteOne({ _id: tagId });
}

export function toTagId(id: unknown): ObjectId {
	if (typeof id !== 'string' || !ObjectId.isValid(id))
		throw new ValidationError('El tag indicado no es válido');
	return new ObjectId(id);
}

/**
 * Convierte los ids que llegan del cliente y comprueba que existan de verdad,
 * para que una canción no acabe con tags fantasma.
 */
export async function resolveTagIds(values: unknown): Promise<ObjectId[]> {
	if (values === undefined || values === null) return [];
	if (!Array.isArray(values)) throw new ValidationError('Los tags deben venir en una lista');

	const unique = [...new Set(values.map((value) => toTagId(value).toString()))];
	if (unique.length === 0) return [];

	const ids = unique.map((value) => new ObjectId(value));
	const db: Db = await getDb();
	const found = await db.collection<TagDoc>(TAGS_COLLECTION).countDocuments({ _id: { $in: ids } });
	if (found !== ids.length) throw new ValidationError('Alguno de los tags ya no existe');
	return ids;
}
