export class ClientApiError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
	}
}

/**
 * Llama a la API del propio servidor. Los endpoints contestan siempre JSON, con
 * `{ error }` cuando algo va mal, así que aquí se traduce a una excepción con el
 * mensaje ya listo para mostrar.
 */
export async function jsonRequest<T>(
	path: string,
	method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
	body?: unknown
): Promise<T> {
	const response = await fetch(path, {
		method,
		headers: {
			accept: 'application/json',
			...(body === undefined ? {} : { 'content-type': 'application/json' })
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});

	const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
	if (!response.ok) {
		throw new ClientApiError(
			typeof payload.error === 'string' ? payload.error : 'No se pudo completar la operación',
			response.status
		);
	}
	return payload as T;
}
