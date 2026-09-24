export class JsonBodyError extends Error {
	constructor(
		public readonly status: 400 | 413 | 415,
		message: string
	) {
		super(message);
		this.name = 'JsonBodyError';
	}
}

/**
 * Lee un cuerpo JSON cortando por tamaño mientras llega, no después: un
 * `request.json()` a secas se traga en memoria lo que le manden.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (contentType !== 'application/json') {
		throw new JsonBodyError(415, 'Se requiere Content-Type application/json');
	}

	const declaredLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new JsonBodyError(413, 'El cuerpo de la petición es demasiado grande');
	}

	const reader = request.body?.getReader();
	if (!reader) throw new JsonBodyError(400, 'Cuerpo JSON inválido');

	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		totalBytes += value.byteLength;
		if (totalBytes > maxBytes) {
			await reader.cancel().catch(() => undefined);
			throw new JsonBodyError(413, 'El cuerpo de la petición es demasiado grande');
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new JsonBodyError(400, 'Cuerpo JSON inválido');
	}
}
