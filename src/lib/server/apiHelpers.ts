import { json } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { isHttpError, ValidationError } from './errors';
import { JsonBodyError, readJsonBody } from './requestBody';
import { MAX_JSON_BODY_BYTES } from '$lib/validation';

/** Lee el cuerpo de la petición y se asegura de que sea un objeto JSON. */
export async function readObjectBody(request: Request): Promise<Record<string, unknown>> {
	const body = await readJsonBody(request, MAX_JSON_BODY_BYTES);
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw new ValidationError('Se espera un objeto JSON');
	}
	return body as Record<string, unknown>;
}

/**
 * El id del usuario de la sesión. El hook ya bloquea las rutas privadas, así
 * que llegar aquí sin usuario sería un error de programación nuestro.
 */
export function requireUserId(locals: App.Locals): ObjectId {
	if (!locals.user) throw new Error('Ruta privada alcanzada sin sesión');
	return new ObjectId(locals.user.id);
}

/**
 * Traduce el error a una respuesta. Solo los errores con status propio enseñan
 * su mensaje; cualquier otro se registra y sale como 500 genérico.
 */
export function failure(error: unknown): Response {
	if (error instanceof JsonBodyError) {
		return json({ error: error.message }, { status: error.status });
	}
	if (isHttpError(error)) {
		return json({ error: error.message }, { status: error.status });
	}
	console.error('Error inesperado en la API:', error);
	return json({ error: 'Error del servidor. Vuelve a intentarlo.' }, { status: 500 });
}
