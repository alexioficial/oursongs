import { ObjectId, type Db } from 'mongodb';
import crypto from 'node:crypto';
import { getDb } from './db';
import type { UserDoc } from './users';

const SESSIONS_COLLECTION = 'sessions';
const SESSION_TTL_DAYS = 30;

export const SESSION_COOKIE = 'oursongs_session';

export interface SessionDoc {
	_id: ObjectId;
	tokenHash: string;
	userId: ObjectId;
	createdAt: Date;
	expiresAt: Date;
}

// Los tokens son 32 bytes en hex. Validamos el formato antes de tocar Mongo.
const TOKEN_REGEX = /^[a-f0-9]{64}$/;

function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

function expiryDate(): Date {
	const expires = new Date();
	expires.setDate(expires.getDate() + SESSION_TTL_DAYS);
	return expires;
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

/**
 * En la base solo queda el hash del token: si alguien lee la colección de
 * sesiones no puede usarlas para entrar.
 */
export async function createSession(userId: ObjectId): Promise<string> {
	const db: Db = await getDb();
	const token = crypto.randomBytes(32).toString('hex');

	await db.collection<SessionDoc>(SESSIONS_COLLECTION).insertOne({
		tokenHash: hashToken(token),
		userId,
		createdAt: new Date(),
		expiresAt: expiryDate()
	} as SessionDoc);

	return token;
}

export async function getUserBySessionToken(token: string): Promise<UserDoc | null> {
	if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) return null;

	const db: Db = await getDb();
	const sessions = db.collection<SessionDoc>(SESSIONS_COLLECTION);

	const session = await sessions.findOne({ tokenHash: hashToken(token) });
	if (!session) return null;

	// El índice TTL de Mongo puede tardar hasta un minuto en pasar; no confiamos
	// solo en él para dejar de aceptar una sesión vencida.
	if (session.expiresAt < new Date()) {
		await sessions.deleteOne({ _id: session._id });
		return null;
	}

	return db.collection<UserDoc>('users').findOne({ _id: session.userId });
}

export async function deleteSession(token: string): Promise<void> {
	if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) return;
	const db: Db = await getDb();
	await db.collection<SessionDoc>(SESSIONS_COLLECTION).deleteOne({ tokenHash: hashToken(token) });
}

/** Cierra la sesión en todos los dispositivos: tras cambiar la contraseña. */
export async function deleteAllSessionsForUser(userId: ObjectId): Promise<void> {
	const db: Db = await getDb();
	await db.collection<SessionDoc>(SESSIONS_COLLECTION).deleteMany({ userId });
}
