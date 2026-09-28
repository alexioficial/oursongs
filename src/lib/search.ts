/**
 * Búsqueda por texto compartida: el servidor busca en Mongo con un patrón y la
 * copia sin conexión filtra en el navegador, y los dos tienen que encontrar lo
 * mismo. Es puro y sin alias para que lo prueben los tests.
 */

/**
 * Quita tildes y diéresis ('Canción' → 'Cancion'). En NFD la letra y su tilde
 * son dos caracteres, así que basta con borrar las marcas que siguen.
 */
export function foldAccents(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Sin escapar, un término de búsqueda con metacaracteres (".*", "(") puede
 * provocar ReDoS o colarse como comodín en la consulta a Mongo.
 */
export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cada letra base con las formas acentuadas que puede tener en lo guardado. */
const ACCENT_VARIANTS: Record<string, string> = {
	a: 'aáàâäã',
	e: 'eéèêë',
	i: 'iíìîï',
	o: 'oóòôöõ',
	u: 'uúùûü',
	n: 'nñ',
	c: 'cç'
};

/**
 * Patrón que encuentra `search` sin importar las tildes: "cancion" y "canción"
 * encuentran "Canción". En la base las letras se guardan como las escribió el
 * usuario, así que la tolerancia va en el patrón y no en los datos. Las
 * mayúsculas van también en la clase porque la `i` de Mongo no asegura el
 * plegado de las letras acentuadas.
 */
export function accentInsensitivePattern(search: string): string {
	return [...foldAccents(search)]
		.map((char) => {
			const variants = ACCENT_VARIANTS[char.toLowerCase()];
			return variants ? `[${variants}${variants.toUpperCase()}]` : escapeRegex(char);
		})
		.join('');
}

/** Lo que compara la búsqueda sin conexión: sin tildes ni mayúsculas. */
export function searchKey(value: string): string {
	return foldAccents(value).toLocaleLowerCase('es');
}
