import { randomUUID } from 'node:crypto';
import { UUID_REGEX } from '../validation';
import type { SongTab, TabNote } from '../types';
import { ValidationError } from './errors';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSongTabs(
	values: unknown,
	current: SongTab[] = [],
	createId: () => string = randomUUID
): SongTab[] {
	if (values === undefined || values === null) return [];
	if (!Array.isArray(values)) throw new ValidationError('Las tablaturas deben venir en una lista');

	const currentIds = new Set(current.map(({ id }) => id));
	const usedIds = new Set<string>();
	const usedNames = new Set<string>();

	return values.map((rawTab) => {
		if (!isRecord(rawTab)) throw new ValidationError('La tablatura indicada no es válida');

		let id: string;
		if (rawTab.id === undefined) {
			id = createId();
		} else {
			const known = typeof rawTab.id === 'string' && currentIds.has(rawTab.id);
			if (typeof rawTab.id !== 'string' || (!known && !UUID_REGEX.test(rawTab.id))) {
				throw new ValidationError('El identificador de la tablatura no es válido');
			}
			id = rawTab.id;
		}

		if (usedIds.has(id)) throw new ValidationError('La lista contiene un identificador repetido');
		usedIds.add(id);

		if (typeof rawTab.name !== 'string') {
			throw new ValidationError('El nombre de la tablatura no es válido');
		}
		const name = rawTab.name.trim();
		if (!name) throw new ValidationError('Escribe un nombre para cada tablatura');
		const nameKey = name.toLowerCase();
		if (usedNames.has(nameKey)) {
			throw new ValidationError('No se pueden repetir los nombres de las tablaturas');
		}
		usedNames.add(nameKey);

		if (!Array.isArray(rawTab.notes)) {
			throw new ValidationError('Las notas de la tablatura deben venir en una lista');
		}
		const usedCells = new Set<string>();
		const notes = rawTab.notes.map((rawNote): TabNote => {
			if (!isRecord(rawNote)) throw new ValidationError('La nota indicada no es válida');
			const { string, column, fret } = rawNote;
			if (typeof string !== 'number' || !Number.isInteger(string) || string < 0 || string > 5) {
				throw new ValidationError('La cuerda debe estar entre 1 y 6');
			}
			if (typeof column !== 'number' || !Number.isSafeInteger(column) || column < 0) {
				throw new ValidationError('La columna de la nota no es válida');
			}
			if (typeof fret !== 'number' || !Number.isInteger(fret) || fret < 0 || fret > 99) {
				throw new ValidationError('El traste debe ser un número entre 0 y 99');
			}
			const cell = `${string}:${column}`;
			if (usedCells.has(cell)) {
				throw new ValidationError('Solo puede haber una nota en cada posición');
			}
			usedCells.add(cell);
			return { string, column, fret };
		});

		notes.sort((left, right) => left.column - right.column || left.string - right.string);
		return { id, name, notes };
	});
}
