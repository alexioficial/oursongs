/**
 * Sin escapar, un término de búsqueda con metacaracteres (".*", "(") puede
 * provocar ReDoS o colarse como comodín en la consulta a Mongo.
 */
export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 'Rock & Roll Clásico' → 'rock-roll-clasico' */
export function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
