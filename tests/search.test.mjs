import { describe, expect, test } from 'bun:test';
import { accentInsensitivePattern, escapeRegex, foldAccents } from '../src/lib/search.ts';
import { slugify } from '../src/lib/server/text.ts';

const matches = (search, text) => new RegExp(accentInsensitivePattern(search), 'i').test(text);

describe('patrón de búsqueda del servidor', () => {
	test('las tildes no cuentan en ninguno de los dos lados', () => {
		expect(matches('cancion', 'Canción de cuna')).toBe(true);
		expect(matches('canción', 'Cancion de cuna')).toBe(true);
		expect(matches('CANCION', 'canción')).toBe(true);
		expect(matches('nino', 'El Niño')).toBe(true);
		expect(matches('pinguino', 'Pingüino')).toBe(true);
	});

	test('sigue distinguiendo lo que no es una tilde', () => {
		expect(matches('cancion', 'Canto')).toBe(false);
		expect(matches('mano', 'mono')).toBe(false);
	});

	test('los metacaracteres se buscan como texto', () => {
		expect(matches('a.b', 'axb')).toBe(false);
		expect(matches('a.b', 'a.b')).toBe(true);
		expect(matches('(coro)', 'Canción (coro)')).toBe(true);
		expect(escapeRegex('.*')).toBe(String.raw`\.\*`);
	});

	test('foldAccents quita tildes y diéresis', () => {
		expect(foldAccents('Canción Pingüino ÑANDÚ')).toBe('Cancion Pinguino NANDU');
	});
});

describe('slugify', () => {
	test('lo latino queda como siempre', () => {
		expect(slugify('Rock & Roll Clásico')).toBe('rock-roll-clasico');
		expect(slugify('  Adoración  ')).toBe('adoracion');
		expect(slugify('Ñandú')).toBe('nandu');
	});

	test('un nombre sin letras latinas también tiene slug', () => {
		expect(slugify('日本')).toBe('日本');
		expect(slugify('Хвала Богу')).toBe('хвала-богу');
		expect(slugify('ガンバ')).toBe('ガンバ');
	});

	test('sin letras ni números se queda vacío', () => {
		expect(slugify('!!! ???')).toBe('');
	});
});
