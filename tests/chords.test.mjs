import { describe, expect, test } from 'bun:test';
import {
	chordsFromText,
	chordsToText,
	formatSemitones,
	isValidChord,
	normalizeChord,
	parseChord,
	resolveSpelling,
	transposeChord,
	transposeChords,
	wrapSemitones
} from '../src/lib/music/chords.ts';

describe('los semitonos entre letras', () => {
	test('de E a F hay un solo semitono', () => {
		expect(transposeChord('E', 1)).toBe('F');
		expect(transposeChord('F', -1)).toBe('E');
	});

	test('de B a C hay un solo semitono', () => {
		expect(transposeChord('B', 1)).toBe('C');
		expect(transposeChord('C', -1)).toBe('B');
	});

	test('donde hay tono, el paso intermedio es una alteración', () => {
		expect(transposeChord('C', 1)).toBe('C#');
		expect(transposeChord('G', 1)).toBe('G#');
		expect(transposeChord('A', 1)).toBe('A#');
	});

	test('E# y B# suenan como F y C', () => {
		expect(transposeChord('E#', 0)).toBe('E#');
		expect(transposeChord('E#', 1)).toBe('F#');
		expect(transposeChord('B#', 1)).toBe('C#');
	});
});

describe('la calidad y las extensiones se respetan', () => {
	test('un acorde largo solo cambia de raíz', () => {
		expect(transposeChord('G#m7add11', 1)).toBe('Am7add11');
		expect(transposeChord('G#m7add11', -1)).toBe('Gm7add11');
	});

	test('ejemplos simples', () => {
		expect(transposeChord('F7', 1)).toBe('F#7');
		expect(transposeChord('Amaj7', 2)).toBe('Bmaj7');
		expect(transposeChord('Csus4', 5)).toBe('Fsus4');
		expect(transposeChord('Dm7b5', 2)).toBe('Em7b5');
	});

	test('el bemol de la calidad no se confunde con el de la raíz', () => {
		expect(transposeChord('Cm7b5', 1)).toBe('C#m7b5');
		expect(parseChord('Cm7b5').root.pitch).toBe(0);
		expect(parseChord('Cm7b5').quality).toBe('m7b5');
	});
});

describe('acordes con bajo', () => {
	test('se transponen las dos notas', () => {
		expect(transposeChord('C/G', 2)).toBe('D/A');
		expect(transposeChord('G#m7add11/D#', 2)).toBe('A#m7add11/F');
		expect(transposeChord('C/B', 1)).toBe('C#/C');
	});

	test('una barra que no lleva nota detrás se queda en la calidad', () => {
		expect(transposeChord('C6/9', 2)).toBe('D6/9');
		expect(parseChord('C6/9').bass).toBeNull();
		expect(parseChord('C6/9').quality).toBe('6/9');
	});
});

describe('sostenidos o bemoles', () => {
	test('por defecto, sostenidos', () => {
		expect(transposeChords(['C', 'F'], 1)).toEqual(['C#', 'F#']);
	});

	test('una canción escrita en bemoles sigue en bemoles', () => {
		expect(resolveSpelling(['Bb', 'Eb', 'F'])).toBe('flat');
		expect(transposeChords(['Bb', 'Eb', 'F'], 1)).toEqual(['B', 'E', 'Gb']);
	});

	test('la escritura se puede forzar', () => {
		expect(transposeChords(['C'], 1, 'flat')).toEqual(['Db']);
		expect(transposeChords(['Bb'], 2, 'sharp')).toEqual(['C']);
		expect(transposeChords(['Bb', 'Eb'], 1, 'sharp')).toEqual(['B', 'E']);
	});

	test('toda la lista comparte escritura, no cada acorde la suya', () => {
		// Manda la mayoría: dos bemoles arrastran al sostenido suelto.
		expect(transposeChords(['Eb', 'Ab', 'F#'], 2)).toEqual(['F', 'Bb', 'Ab']);
		// Con empate gana el sostenido, que es el valor por defecto.
		expect(resolveSpelling(['Eb', 'F#'])).toBe('sharp');
		expect(transposeChords(['Eb', 'F#'], 2)).toEqual(['F', 'G#']);
	});
});

describe('la vuelta a la octava', () => {
	test('doce semitonos devuelven el acorde original', () => {
		expect(wrapSemitones(12)).toBe(0);
		expect(wrapSemitones(-12)).toBe(0);
		expect(transposeChord('Cb', 12)).toBe('Cb');
		expect(transposeChords(['Bb', 'C#'], 12)).toEqual(['Bb', 'C#']);
	});

	test('pasarse de la octava equivale a empezar de nuevo', () => {
		expect(transposeChord('C', 13)).toBe(transposeChord('C', 1));
		expect(transposeChord('C', -13)).toBe(transposeChord('C', -1));
	});

	test('sin transponer, el texto no se toca', () => {
		expect(transposeChord('Cb', 0)).toBe('Cb');
		expect(transposeChord('lo que sea', 0)).toBe('lo que sea');
	});

	test('la vuelta completa de la escala', () => {
		expect(transposeChord('A', 3)).toBe('C');
		expect(transposeChord('C', -3)).toBe('A');
	});
});

describe('lo que no es un acorde', () => {
	test('se devuelve intacto en vez de romperse', () => {
		expect(transposeChord('N.C.', 2)).toBe('N.C.');
		expect(transposeChord('%', 2)).toBe('%');
		expect(transposeChord('', 2)).toBe('');
		expect(parseChord('N.C.')).toBeNull();
	});

	test('y no se puede guardar', () => {
		expect(isValidChord('N.C.')).toBe(false);
		expect(isValidChord('')).toBe(false);
		expect(isValidChord('   ')).toBe(false);
		expect(isValidChord('C G')).toBe(false);
		expect(isValidChord('H7')).toBe(false);
		expect(isValidChord('C'.repeat(40))).toBe(false);
	});

	test('los acordes de verdad sí', () => {
		for (const chord of ['C', 'F#m', 'Bb', 'G#m7add11/D#', 'Cmaj7(#11)', 'Ddim', 'E+', 'Am7']) {
			expect(isValidChord(chord)).toBe(true);
		}
	});
});

describe('forma canónica al guardar', () => {
	test('la raíz se pone en mayúscula', () => {
		expect(normalizeChord('am7')).toBe('Am7');
		expect(normalizeChord('  c/g  ')).toBe('C/G');
		expect(normalizeChord('bb')).toBe('Bb');
	});

	test('los símbolos musicales se pasan a ASCII', () => {
		expect(normalizeChord('F♯m')).toBe('F#m');
		expect(normalizeChord('E♭maj7')).toBe('Ebmaj7');
	});

	test('la calidad se deja como la escribió el usuario', () => {
		expect(normalizeChord('cMAJ7')).toBe('CMAJ7');
	});
});

describe('etiqueta de la transposición', () => {
	test('lleva signo', () => {
		expect(formatSemitones(0)).toBe('0');
		expect(formatSemitones(2)).toBe('+2');
		expect(formatSemitones(-3)).toBe('-3');
		expect(formatSemitones(12)).toBe('0');
	});
});

describe('progresión escrita de corrido', () => {
	test('se parte por espacios, comas y barras de compás', () => {
		expect(chordsFromText('C G Am F')).toEqual(['C', 'G', 'Am', 'F']);
		expect(chordsFromText('C, G,Am')).toEqual(['C', 'G', 'Am']);
		expect(chordsFromText('C | G | Am')).toEqual(['C', 'G', 'Am']);
	});

	test('los saltos de línea y los espacios sobrantes no cuentan', () => {
		expect(chordsFromText('  C\n G \n\n Am  ')).toEqual(['C', 'G', 'Am']);
		expect(chordsFromText('   ')).toEqual([]);
		expect(chordsFromText('')).toEqual([]);
	});

	test('ida y vuelta', () => {
		expect(chordsToText(chordsFromText('C G/B Am7'))).toBe('C G/B Am7');
	});
});
