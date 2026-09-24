/**
 * Errores con un status HTTP propio. Sirven para que la API no tenga que
 * adivinar: lo que no sea uno de estos es un fallo nuestro y sale como 500 sin
 * enseñar el mensaje interno.
 */

export class HttpError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = new.target.name;
	}
}

/** Datos que el usuario puede corregir. */
export class ValidationError extends HttpError {
	constructor(message: string) {
		super(400, message);
	}
}

/** Choca con algo que ya existe (un nombre repetido). */
export class ConflictError extends HttpError {
	constructor(message: string) {
		super(409, message);
	}
}

export class NotFoundError extends HttpError {
	constructor(message: string) {
		super(404, message);
	}
}

export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
}
