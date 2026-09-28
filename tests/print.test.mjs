import { describe, expect, test } from 'bun:test';
import { chordRowText, wrapChordLine } from '../src/lib/music/printLayout.ts';
import {
	columnCapacity,
	DEFAULT_PRINT_SETTINGS,
	isDefaultPrintSettings,
	parsePrintSettings
} from '../src/lib/print.ts';

const chord = (column, label) => ({ chordId: label, offset: column, column, label });

/** Cada trozo como lo vería quien lee: filas de acordes y la letra debajo. */
const render = (lines) =>
	lines.map(({ text, chords }) => ({
		chords: chordRowText(chords),
		text
	}));

describe('wrapChordLine', () => {
	test('una línea que cabe queda igual', () => {
		const chords = [chord(0, 'D'), chord(10, 'Bm')];
		expect(wrapChordLine('Used to do it all', chords, 40)).toEqual([
			{ text: 'Used to do it all', chords }
		]);
	});

	test('corta al principio de una palabra y cada trozo se lleva sus acordes', () => {
		const text = 'Used to do it all so pure for the love of';
		const lines = wrapChordLine(text, [chord(0, 'D'), chord(21, 'Bm'), chord(38, 'G')], 30);
		expect(render(lines)).toEqual([
			{ chords: 'D                    Bm', text: 'Used to do it all so pure for' },
			{ chords: '        G', text: 'the love of' }
		]);
	});

	test('ningún trozo pasa del ancho, contando los acordes', () => {
		const text = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce';
		const chords = [chord(4, 'Cmaj7'), chord(18, 'G#m7add11/D#'), chord(50, 'Am')];
		for (const width of [10, 14, 20, 31]) {
			for (const line of wrapChordLine(text, chords, width)) {
				expect([...line.text].length).toBeLessThanOrEqual(width);
				for (const { column, label } of line.chords) {
					if (column > 0) expect(column + label.length).toBeLessThanOrEqual(width);
				}
			}
		}
	});

	test('no se pierde ni se repite ningún acorde', () => {
		const text = 'Hope a man notices me, I dont know what this all means';
		const chords = [chord(0, 'G'), chord(15, 'D'), chord(30, 'A/C#'), chord(35, 'Bm')];
		const lines = wrapChordLine(text, chords, 18);
		expect(lines.flatMap((line) => line.chords.map(({ label }) => label))).toEqual([
			'G',
			'D',
			'A/C#',
			'Bm'
		]);
		expect(lines.map(({ text }) => text).join(' ')).toBe(text);
	});

	test('una palabra más larga que el ancho se corta por dentro', () => {
		const lines = wrapChordLine('Supercalifragilístico', [], 8);
		expect(lines.map(({ text }) => text)).toEqual(['Supercal', 'ifragilí', 'stico']);
	});

	test('una línea de solo acordes se parte antes del acorde que no cabe', () => {
		const text = ' '.repeat(16);
		const lines = wrapChordLine(text, [chord(1, 'D'), chord(5, 'Bm'), chord(10, 'F#m')], 11);
		expect(render(lines)).toEqual([
			{ chords: ' D   Bm', text: '' },
			{ chords: 'F#m', text: '' }
		]);
	});

	test('un acorde al final de la línea que no cabe baja solo', () => {
		const lines = wrapChordLine('Amén', [chord(4, 'Gsus4')], 6);
		expect(render(lines)).toEqual([
			{ chords: '', text: 'Amén' },
			{ chords: 'Gsus4', text: '' }
		]);
	});

	test('los espacios del final del trozo no cuentan', () => {
		const lines = wrapChordLine('Hola          mundo', [], 6);
		expect(lines.map(({ text }) => text)).toEqual(['Hola', 'mundo']);
	});

	test('una línea vacía sigue siendo una línea', () => {
		expect(wrapChordLine('', [], 20)).toEqual([{ text: '', chords: [] }]);
	});
});

describe('opciones de impresión', () => {
	test('lo guardado roto o de otra versión vuelve a lo de por defecto', () => {
		expect(parsePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
		expect(parsePrintSettings('basura')).toEqual(DEFAULT_PRINT_SETTINGS);
		expect(
			parsePrintSettings({
				paper: 'a3',
				textScale: 'grande',
				lyricsColor: 'red',
				chordsColor: '#12345',
				twoColumns: 'sí'
			})
		).toEqual(DEFAULT_PRINT_SETTINGS);
	});

	test('lo válido se respeta y el tamaño se lleva a su rango', () => {
		const settings = parsePrintSettings({
			paper: 'carta',
			textScale: 999,
			lyricsColor: '#1A73E8',
			chordsBold: false,
			twoColumns: false
		});
		expect(settings.paper).toBe('carta');
		expect(settings.textScale).toBe(160);
		expect(settings.lyricsColor).toBe('#1a73e8');
		expect(settings.chordsBold).toBe(false);
		expect(settings.twoColumns).toBe(false);
		expect(parsePrintSettings({ textScale: 12 }).textScale).toBe(60);
		expect(parsePrintSettings({ textScale: 103 }).textScale).toBe(105);
	});

	test('isDefaultPrintSettings', () => {
		expect(isDefaultPrintSettings({ ...DEFAULT_PRINT_SETTINGS })).toBe(true);
		expect(isDefaultPrintSettings({ ...DEFAULT_PRINT_SETTINGS, twoColumns: false })).toBe(false);
	});

	test('cabe más con una columna, con letra más pequeña o con papel más ancho', () => {
		const base = columnCapacity(DEFAULT_PRINT_SETTINGS, 0.6);
		expect(base).toBeGreaterThan(30);
		expect(base).toBeLessThan(50);
		expect(columnCapacity({ ...DEFAULT_PRINT_SETTINGS, twoColumns: false }, 0.6)).toBeGreaterThan(
			base * 2
		);
		expect(columnCapacity({ ...DEFAULT_PRINT_SETTINGS, textScale: 150 }, 0.6)).toBeLessThan(base);
		expect(
			columnCapacity({ ...DEFAULT_PRINT_SETTINGS, paper: 'carta' }, 0.6)
		).toBeGreaterThanOrEqual(base);
	});
});
