import { MongoClient, MongoServerError, type CreateIndexesOptions, type Db } from 'mongodb';
import { env } from '$env/dynamic/private';

/**
 * Collation insensible a mayúsculas (strength 2 sí distingue acentos, que en
 * español son letras distintas). Se usa en los índices únicos y en las búsquedas
 * por nombre, para que "Rock" y "rock" sean el mismo tag.
 */
export const CI_COLLATION = { locale: 'es', strength: 2 } as const;

let client: MongoClient | null = null;
let db: Db | null = null;
let indexesPromise: Promise<void> | null = null;
// Reusamos la promesa de conexión: sin esto, dos requests que entren antes de
// que `connect()` resuelva crean dos MongoClient en paralelo.
let connectPromise: Promise<Db> | null = null;

if (!env.MONGODB_URI) {
	console.warn('MONGODB_URI no está definida. Configúrala en tu entorno.');
}

/** Nombre que Mongo le pone por defecto a un índice ('title_1', 'a_1_b_-1'). */
function defaultIndexName(keys: Record<string, 1 | -1>): string {
	return Object.entries(keys)
		.map(([field, direction]) => `${field}_${direction}`)
		.join('_');
}

async function ensureIndex(
	database: Db,
	collection: string,
	keys: Record<string, 1 | -1>,
	options: CreateIndexesOptions = {}
) {
	try {
		await database.collection(collection).createIndex(keys, options);
	} catch (error) {
		// 85/86: ya existe un índice con esas claves o ese nombre pero con otras
		// opciones (collation, unique…). Lo recreamos en vez de dejar la app sin
		// arrancar por un cambio de esquema.
		const conflict = error instanceof MongoServerError && (error.code === 85 || error.code === 86);
		if (!conflict) throw error;
		await database.collection(collection).dropIndex(defaultIndexName(keys));
		await database.collection(collection).createIndex(keys, options);
	}
}

async function ensureIndexes(database: Db) {
	await Promise.all([
		// Un nombre de usuario es único sin importar las mayúsculas.
		ensureIndex(database, 'users', { username: 1 }, { unique: true, collation: CI_COLLATION }),

		ensureIndex(database, 'sessions', { tokenHash: 1 }, { unique: true }),
		ensureIndex(database, 'sessions', { userId: 1 }),
		// Mongo borra solo las sesiones vencidas.
		ensureIndex(database, 'sessions', { expiresAt: 1 }, { expireAfterSeconds: 0 }),

		ensureIndex(database, 'tags', { name: 1 }, { unique: true, collation: CI_COLLATION }),
		ensureIndex(database, 'tags', { slug: 1 }, { unique: true }),

		ensureIndex(database, 'songs', { updatedAt: -1 }),
		ensureIndex(database, 'songs', { title: 1 }),
		ensureIndex(database, 'songs', { tagIds: 1 }),
		// Solo las canciones creadas con id de cliente: el resto no lo tiene.
		ensureIndex(
			database,
			'songs',
			{ clientId: 1 },
			{ unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
		)
	]);
}

export async function getDb(): Promise<Db> {
	if (db && client && indexesPromise) {
		await indexesPromise;
		return db;
	}

	if (!connectPromise) {
		const uri = env.MONGODB_URI;
		const dbName = env.MONGODB_DB ?? 'oursongs';
		if (!uri) throw new Error('MONGODB_URI no está definida');

		connectPromise = (async () => {
			const connection = new MongoClient(uri, {
				serverSelectionTimeoutMS: 5_000,
				connectTimeoutMS: 10_000,
				socketTimeoutMS: 30_000
			});
			try {
				await connection.connect();
				const connectedDb = connection.db(dbName);
				indexesPromise = ensureIndexes(connectedDb);
				await indexesPromise;
				client = connection;
				db = connectedDb;
				return connectedDb;
			} catch (error) {
				// No servimos tráfico sin los índices de integridad. Limpiamos el
				// estado para que el próximo request reintente de verdad.
				console.error('Error al conectar o preparar MongoDB:', error);
				connectPromise = null;
				indexesPromise = null;
				await connection.close().catch(() => {});
				throw error;
			}
		})();
	}

	return connectPromise;
}
