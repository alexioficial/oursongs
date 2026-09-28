/**
 * 'Rock & Roll Clásico' → 'rock-roll-clasico', '日本の歌' → '日本の歌'
 *
 * Las tildes latinas se quitan, pero cualquier otra letra, número o marca se
 * conserva: con `[a-z0-9]` un nombre sin letras latinas se quedaba sin slug y el
 * tag no se podía crear. Para lo latino el resultado es el de siempre, así que
 * los slugs ya guardados siguen valiendo.
 */
export function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.normalize('NFC');
}
