import { MongoServerError, ObjectId, type Db } from 'mongodb';
import { CI_COLLATION, getDb } from './db';
import { ConflictError, ValidationError } from './errors';
import { hashPassword, verifyPassword, wastePasswordTime } from './password';
import { NAME_MAX_LENGTH, USERNAME_REGEX, USERNAME_RULE } from '$lib/validation';
import type { SessionUser } from '$lib/types';

const USERS_COLLECTION = 'users';

export interface UserDoc {
	_id: ObjectId;
	username: string;
	passwordHash: string;
	name?: string;
	createdAt: Date;
	updatedAt?: Date;
}

export class UsernameTakenError extends ConflictError {
	constructor() {
		super('Ese nombre de usuario ya está en uso');
	}
}

export function isDuplicateKeyError(error: unknown): boolean {
	return error instanceof MongoServerError && error.code === 11000;
}

export function toSessionUser(user: UserDoc): SessionUser {
	return {
		id: user._id.toString(),
		username: user.username,
		...(user.name && { name: user.name })
	};
}

function normalizeUsername(username: unknown): string {
	if (typeof username !== 'string')
		throw new ValidationError('El nombre de usuario es obligatorio');
	const clean = username.trim();
	if (!USERNAME_REGEX.test(clean)) throw new ValidationError(USERNAME_RULE);
	return clean;
}

function normalizeName(name: unknown): string | undefined {
	if (name === undefined || name === null || name === '') return undefined;
	if (typeof name !== 'string') throw new ValidationError('El nombre no es válido');
	const clean = name.trim();
	if (!clean) return undefined;
	if (clean.length > NAME_MAX_LENGTH) throw new ValidationError('El nombre es demasiado largo');
	return clean;
}

export async function getUserByUsername(username: string): Promise<UserDoc | null> {
	if (typeof username !== 'string' || !username.trim()) return null;
	const db: Db = await getDb();
	return db
		.collection<UserDoc>(USERS_COLLECTION)
		.findOne({ username: username.trim() }, { collation: CI_COLLATION });
}

export async function getUserById(id: string | ObjectId): Promise<UserDoc | null> {
	if (typeof id === 'string' && !ObjectId.isValid(id)) return null;
	const db: Db = await getDb();
	return db.collection<UserDoc>(USERS_COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function createUser(input: {
	username: unknown;
	password: string;
	name?: unknown;
}): Promise<UserDoc> {
	const username = normalizeUsername(input.username);
	const name = normalizeName(input.name);
	const passwordHash = await hashPassword(input.password);

	const db: Db = await getDb();
	const now = new Date();
	const user = { username, passwordHash, createdAt: now, ...(name && { name }) } as UserDoc;

	try {
		const result = await db.collection<UserDoc>(USERS_COLLECTION).insertOne(user);
		return { ...user, _id: result.insertedId };
	} catch (error) {
		if (isDuplicateKeyError(error)) throw new UsernameTakenError();
		throw error;
	}
}

/**
 * Devuelve el usuario solo si la contraseña coincide. Cuando el usuario no
 * existe igual gastamos el tiempo de un hash, para que el login no delate por
 * su tardanza qué nombres están registrados.
 */
export async function verifyCredentials(
	username: unknown,
	password: unknown
): Promise<UserDoc | null> {
	if (typeof username !== 'string' || typeof password !== 'string') return null;

	const user = await getUserByUsername(username);
	if (!user) {
		await wastePasswordTime(password);
		return null;
	}

	return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function setPassword(userId: ObjectId, password: string): Promise<void> {
	const passwordHash = await hashPassword(password);
	const db: Db = await getDb();
	await db
		.collection<UserDoc>(USERS_COLLECTION)
		.updateOne({ _id: userId }, { $set: { passwordHash, updatedAt: new Date() } });
}
