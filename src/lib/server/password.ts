import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ValidationError } from './errors';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../validation';

const scrypt = promisify(scryptCallback) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

// scrypt viene en node:crypto, así que funciona igual bajo bun y bajo node y no
// añade una dependencia nativa al proyecto. N = 2^15 tarda ~100 ms por hash.
const PARAMS = { N: 32_768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Hash con el que comparar cuando el usuario no existe (ver verifyPassword). */
const DUMMY_HASH =
	'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
	'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function passwordProblem(password: unknown): string | null {
	if (typeof password !== 'string') return 'La contraseña es obligatoria';
	if (password.length < PASSWORD_MIN_LENGTH) {
		return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
	}
	if (password.length > PASSWORD_MAX_LENGTH) return 'La contraseña es demasiado larga';
	return null;
}

export async function hashPassword(password: string): Promise<string> {
	const problem = passwordProblem(password);
	if (problem) throw new ValidationError(problem);

	const salt = randomBytes(SALT_LENGTH);
	const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
	const { N, r, p } = PARAMS;
	return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/**
 * Verifica una contraseña contra el hash guardado. Los parámetros viajan en el
 * propio hash, así que subirlos en el futuro no invalida los hashes viejos.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	if (typeof password !== 'string' || password.length > PASSWORD_MAX_LENGTH) return false;

	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

	const [, rawN, rawR, rawP, saltBase64, keyBase64] = parts;
	const N = Number(rawN);
	const r = Number(rawR);
	const p = Number(rawP);
	if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) return false;

	const expected = Buffer.from(keyBase64, 'base64');
	const salt = Buffer.from(saltBase64, 'base64');
	if (expected.length === 0 || salt.length === 0) return false;

	const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
		N,
		r,
		p,
		maxmem: Math.max(PARAMS.maxmem, 128 * N * r * 2)
	});
	return timingSafeEqual(expected, actual);
}

/**
 * Consume el mismo tiempo que una verificación real. Se usa cuando el usuario
 * no existe, para que el login no delate qué nombres están registrados.
 */
export async function wastePasswordTime(password: string): Promise<void> {
	await verifyPassword(password, DUMMY_HASH).catch(() => false);
}
