/**
 * Alta de usuarios. No hay registro público: las cuentas se crean desde aquí.
 *
 *   bun run create:user pepe
 *   bun run create:user pepe --password "una contraseña larga" --name "Pepe"
 *   bun run create:user pepe --password "otra contraseña" --reset
 *
 * Es un script suelto: se conecta a Mongo por su cuenta porque `$lib/server/db`
 * depende de `$env/dynamic/private`, que solo existe dentro de SvelteKit. Bun
 * carga el .env sin ayuda.
 */
import { MongoClient } from 'mongodb';
import { hashPassword, passwordProblem } from '../src/lib/server/password.ts';
import { NAME_MAX_LENGTH, USERNAME_REGEX, USERNAME_RULE } from '../src/lib/validation.ts';

/** Debe coincidir con CI_COLLATION en src/lib/server/db.ts. */
const CI_COLLATION = { locale: 'es', strength: 2 } as const;

interface Args {
	username?: string;
	password?: string;
	name?: string;
	reset: boolean;
}

function parseArgs(argv: string[]): Args {
	const args: Args = { reset: false };

	for (let index = 0; index < argv.length; index++) {
		const token = argv[index];
		if (token === '--reset') {
			args.reset = true;
		} else if (token === '--password' || token === '--name' || token === '--username') {
			const value = argv[++index];
			if (value === undefined) throw new Error(`Falta el valor de ${token}`);
			if (token === '--password') args.password = value;
			if (token === '--name') args.name = value;
			if (token === '--username') args.username = value;
		} else if (token === '--') {
			continue;
		} else if (token.startsWith('-')) {
			throw new Error(`Opción desconocida: ${token}`);
		} else if (args.username === undefined) {
			args.username = token;
		} else if (args.name === undefined) {
			args.name = token;
		}
	}

	return args;
}

function fail(message: string): never {
	console.error(`✗ ${message}`);
	process.exit(1);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	const uri = process.env.MONGODB_URI;
	const dbName = process.env.MONGODB_DB ?? 'oursongs';
	if (!uri) fail('MONGODB_URI no está definida (copia .env.example a .env).');

	const username = (args.username ?? '').trim();
	if (!USERNAME_REGEX.test(username)) fail(`Nombre de usuario inválido. ${USERNAME_RULE}`);

	// `prompt` hace eco de lo que se escribe, así que para no dejar la contraseña
	// en el historial de la terminal conviene pasarla por OURSONGS_PASSWORD.
	const password = args.password ?? process.env.OURSONGS_PASSWORD ?? prompt('Contraseña:') ?? '';
	const problem = passwordProblem(password);
	if (problem) fail(problem);

	const name = args.name?.trim();
	if (name && name.length > NAME_MAX_LENGTH) fail('El nombre es demasiado largo.');

	const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
	try {
		await client.connect();
		const users = client.db(dbName).collection('users');
		// El índice puede no existir todavía si la app nunca arrancó contra esta base.
		await users.createIndex({ username: 1 }, { unique: true, collation: CI_COLLATION });

		const existing = await users.findOne({ username }, { collation: CI_COLLATION });
		if (existing && !args.reset) {
			fail(
				`El usuario "${existing.username}" ya existe. Usa --reset para cambiarle la contraseña.`
			);
		}

		const passwordHash = await hashPassword(password);

		if (existing) {
			await users.updateOne(
				{ _id: existing._id },
				{ $set: { passwordHash, updatedAt: new Date(), ...(name && { name }) } }
			);
			// Las sesiones abiertas dejan de valer tras cambiar la contraseña.
			const removed = await client
				.db(dbName)
				.collection('sessions')
				.deleteMany({ userId: existing._id });
			console.log(`✓ Contraseña de "${existing.username}" actualizada.`);
			if (removed.deletedCount) console.log(`  ${removed.deletedCount} sesión(es) cerradas.`);
			return;
		}

		await users.insertOne({
			username,
			passwordHash,
			createdAt: new Date(),
			...(name && { name })
		});
		console.log(`✓ Usuario "${username}" creado.`);
	} finally {
		await client.close();
	}
}

main().catch((error) => {
	fail(error instanceof Error ? error.message : String(error));
});
