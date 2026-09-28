/**
 * Opciones de la hoja para imprimir. Son una preferencia del dispositivo (se
 * guardan en localStorage), no de la canción; la transposición no entra aquí
 * porque cada canción tiene la suya.
 *
 * Todo lo que no toca `localStorage` es puro y lo prueban los tests.
 */

export type PaperSize = 'a4' | 'oficio' | 'carta';

export interface Paper {
	label: string;
	/** Las medidas como se conoce el papel donde se vende. */
	dimensions: string;
	/** Milímetros, para la vista previa y para calcular cuánto cabe por línea. */
	width: number;
	height: number;
	/** Lo que entiende `@page { size }` y, con ello, el diálogo de imprimir. */
	css: string;
}

/**
 * Oficio es el de 8½ × 13 pulgadas (216 × 330 mm), el que se vende como oficio
 * en casi toda Latinoamérica; el legal de EE. UU. es más largo.
 */
export const PAPERS: Record<PaperSize, Paper> = {
	a4: { label: 'A4', dimensions: '210 × 297 mm', width: 210, height: 297, css: 'A4' },
	oficio: {
		label: 'Oficio',
		dimensions: '8½ × 13 pulgadas',
		width: 215.9,
		height: 330.2,
		css: '8.5in 13in'
	},
	carta: {
		label: 'Carta',
		dimensions: '8½ × 11 pulgadas',
		width: 215.9,
		height: 279.4,
		css: 'letter'
	}
};

export const PAPER_SIZES = Object.keys(PAPERS) as PaperSize[];

/** Márgenes de la página y hueco entre columnas, en milímetros. */
export const PAGE_MARGIN_X = 14;
export const PAGE_MARGIN_Y = 14;
export const COLUMN_GAP = 8;

/** Tamaño de la letra al 100 %, en puntos. */
export const LYRICS_FONT_PT = 10.5;

export const TEXT_SCALE_MIN = 60;
export const TEXT_SCALE_MAX = 160;
export const TEXT_SCALE_STEP = 5;

/**
 * Colores para el papel. Van en hex fijo y no en tokens del tema: la hoja es
 * blanca siempre, también con el tema oscuro, así que no dependen de él.
 */
export const PRINT_COLORS = [
	{ name: 'Gris', value: '#5f6368' },
	{ name: 'Negro', value: '#000000' },
	{ name: 'Naranja', value: '#e8710a' },
	{ name: 'Rojo', value: '#d93025' },
	{ name: 'Azul', value: '#1a73e8' },
	{ name: 'Verde', value: '#188038' },
	{ name: 'Morado', value: '#8430ce' }
] as const;

export interface PrintSettings {
	paper: PaperSize;
	/** Porcentaje sobre el tamaño base de todo el texto. */
	textScale: number;
	/** Letra y títulos. */
	lyricsColor: string;
	lyricsBold: boolean;
	/** Acordes y artista. */
	chordsColor: string;
	chordsBold: boolean;
	twoColumns: boolean;
	/** Sin acordes sale solo la letra, para quien canta y no toca. */
	showChords: boolean;
}

export const DEFAULT_PRINT_SETTINGS: Readonly<PrintSettings> = Object.freeze({
	paper: 'a4',
	textScale: 100,
	lyricsColor: '#000000',
	lyricsBold: false,
	chordsColor: '#e8710a',
	chordsBold: true,
	twoColumns: true,
	showChords: true
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lee lo guardado campo a campo: lo que venga de otra versión o esté roto se
 * queda en su valor por defecto en vez de romper la pantalla.
 */
export function parsePrintSettings(raw: unknown): PrintSettings {
	const settings: PrintSettings = { ...DEFAULT_PRINT_SETTINGS };
	if (!isRecord(raw)) return settings;

	if (typeof raw.paper === 'string' && raw.paper in PAPERS) settings.paper = raw.paper as PaperSize;
	if (typeof raw.textScale === 'number' && Number.isFinite(raw.textScale)) {
		const stepped = Math.round(raw.textScale / TEXT_SCALE_STEP) * TEXT_SCALE_STEP;
		settings.textScale = Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, stepped));
	}
	if (typeof raw.lyricsColor === 'string' && HEX_COLOR.test(raw.lyricsColor)) {
		settings.lyricsColor = raw.lyricsColor.toLowerCase();
	}
	if (typeof raw.chordsColor === 'string' && HEX_COLOR.test(raw.chordsColor)) {
		settings.chordsColor = raw.chordsColor.toLowerCase();
	}
	if (typeof raw.lyricsBold === 'boolean') settings.lyricsBold = raw.lyricsBold;
	if (typeof raw.chordsBold === 'boolean') settings.chordsBold = raw.chordsBold;
	if (typeof raw.twoColumns === 'boolean') settings.twoColumns = raw.twoColumns;
	if (typeof raw.showChords === 'boolean') settings.showChords = raw.showChords;
	return settings;
}

export function isDefaultPrintSettings(settings: PrintSettings): boolean {
	return (Object.keys(DEFAULT_PRINT_SETTINGS) as (keyof PrintSettings)[]).every(
		(key) => settings[key] === DEFAULT_PRINT_SETTINGS[key]
	);
}

const PX_PER_MM = 96 / 25.4;
const PX_PER_PT = 96 / 72;

/**
 * Cuántas columnas de texto caben en una columna de la hoja. `advance` es el
 * ancho de un carácter de la fuente monoespaciada en em (se mide en el
 * navegador: cambia según qué fuente tenga el sistema). En CSS un milímetro y un
 * punto valen lo mismo en pantalla que en el papel, así que lo que cabe en la
 * vista previa es lo que cabe al imprimir.
 */
export function columnCapacity(settings: PrintSettings, advance: number): number {
	const paper = PAPERS[settings.paper];
	const columns = settings.twoColumns ? 2 : 1;
	const widthMm = (paper.width - 2 * PAGE_MARGIN_X - (columns - 1) * COLUMN_GAP) / columns;
	const charPx = LYRICS_FONT_PT * (settings.textScale / 100) * PX_PER_PT * advance;
	return Math.max(10, Math.floor((widthMm * PX_PER_MM) / charPx));
}

const STORAGE_KEY = 'oursongs:print';

export function loadPrintSettings(): PrintSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return parsePrintSettings(raw ? JSON.parse(raw) : null);
	} catch {
		return { ...DEFAULT_PRINT_SETTINGS };
	}
}

export function savePrintSettings(settings: PrintSettings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Sin almacenamiento las opciones duran lo que dure la pantalla.
	}
}
