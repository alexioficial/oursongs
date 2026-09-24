import { randomUUID } from 'node:crypto';
import { isValidChord, normalizeChord } from '../music/chords';
import { splitGraphemes } from '../music/chordPlacements';
import { MAX_CHORDS_PER_SONG, MAX_CHORD_PLACEMENTS_PER_SONG } from '../validation';
import type { ChordPlacement, SongChord, SongChordInput } from '../types';
import { ValidationError } from './errors';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeChordCatalog(
	values: unknown,
	current: SongChord[] = [],
	createId: () => string = randomUUID
): SongChord[] {
	if (values === undefined || values === null) return [];
	if (!Array.isArray(values)) throw new ValidationError('Los acordes deben venir en una lista');
	if (values.length > MAX_CHORDS_PER_SONG) {
		throw new ValidationError(`No se pueden registrar más de ${MAX_CHORDS_PER_SONG} acordes`);
	}

	const currentIds = new Set(current.map(({ id }) => id));
	const usedIds = new Set<string>();
	const usedValues = new Set<string>();

	return values.map((rawValue) => {
		if (!isRecord(rawValue)) throw new ValidationError('El acorde indicado no es válido');
		const input = rawValue as SongChordInput;
		let id: string;
		if (input.id === undefined) {
			id = createId();
		} else {
			if (typeof input.id !== 'string' || !currentIds.has(input.id)) {
				throw new ValidationError('El acorde indicado ya no existe');
			}
			id = input.id;
		}

		if (usedIds.has(id)) {
			throw new ValidationError('El catálogo contiene un identificador repetido');
		}
		usedIds.add(id);

		if (typeof input.value !== 'string' || !isValidChord(input.value)) {
			throw new ValidationError(`"${String(input.value ?? '').slice(0, 24)}" no parece un acorde`);
		}
		const value = normalizeChord(input.value);
		if (usedValues.has(value)) {
			throw new ValidationError('El catálogo no puede repetir acordes');
		}
		usedValues.add(value);
		return { id, value };
	});
}

export function normalizeChordPlacements(
	values: unknown,
	chords: SongChord[],
	lyrics: string
): ChordPlacement[] {
	if (values === undefined || values === null) return [];
	if (!Array.isArray(values)) throw new ValidationError('Las posiciones deben venir en una lista');
	if (values.length > MAX_CHORD_PLACEMENTS_PER_SONG) {
		throw new ValidationError(
			`No se pueden colocar más de ${MAX_CHORD_PLACEMENTS_PER_SONG} acordes`
		);
	}

	const chordIds = new Set(chords.map(({ id }) => id));
	const validOffsets = new Set(splitGraphemes(lyrics).map(({ offset }) => offset));
	validOffsets.add(lyrics.length);
	const usedOffsets = new Set<number>();

	return values
		.map((rawValue) => {
			if (!isRecord(rawValue)) throw new ValidationError('La posición del acorde no es válida');
			const { chordId, offset } = rawValue;
			if (typeof chordId !== 'string' || !chordIds.has(chordId)) {
				throw new ValidationError('El acorde asignado ya no existe');
			}
			if (typeof offset !== 'number' || !Number.isInteger(offset) || !validOffsets.has(offset)) {
				throw new ValidationError('La posición del acorde no es válida');
			}
			if (usedOffsets.has(offset)) {
				throw new ValidationError('Solo puede haber un acorde en cada posición');
			}
			usedOffsets.add(offset);
			return { chordId, offset };
		})
		.sort((a, b) => a.offset - b.offset);
}

interface SongChordState {
	lyrics: string;
	chords: SongChord[];
	chordPlacements: ChordPlacement[];
}

interface SongChordStateInput {
	lyrics: string;
	chords?: unknown;
	chordPlacements?: unknown;
}

export function normalizeSongChordState(
	input: SongChordStateInput,
	current?: SongChordState
): Pick<SongChordState, 'chords' | 'chordPlacements'> {
	const chords =
		input.chords === undefined
			? (current?.chords ?? [])
			: normalizeChordCatalog(input.chords, current?.chords ?? []);

	if (input.chordPlacements !== undefined) {
		return {
			chords,
			chordPlacements: normalizeChordPlacements(input.chordPlacements, chords, input.lyrics)
		};
	}

	try {
		return {
			chords,
			chordPlacements: normalizeChordPlacements(
				current?.chordPlacements ?? [],
				chords,
				input.lyrics
			)
		};
	} catch (error) {
		if (error instanceof ValidationError && current) {
			throw new ValidationError('Actualiza también la alineación de los acordes');
		}
		throw error;
	}
}
