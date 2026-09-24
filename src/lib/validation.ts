/**
 * Límites y formatos compartidos por cliente, servidor y scripts. Están en un
 * único sitio para que el formulario avise de lo mismo que rechaza la API.
 */

export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,20}$/;
export const USERNAME_RULE = 'De 3 a 20 caracteres: letras, números, ".", "_" o "-".';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export const NAME_MAX_LENGTH = 60;

export const TITLE_MAX_LENGTH = 120;
export const ARTIST_MAX_LENGTH = 120;
export const LYRICS_MAX_LENGTH = 20_000;

export const TAG_NAME_MAX_LENGTH = 40;

export const MAX_CHORDS_PER_SONG = 200;

/** Tope del cuerpo JSON de la API: la letra es lo único que abulta. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;
