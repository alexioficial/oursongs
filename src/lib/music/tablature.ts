import type { SongTab, TabNote } from '../types';

export function setTabNote(tab: SongTab, note: TabNote): SongTab {
	const notes = tab.notes.filter(
		(current) => current.string !== note.string || current.column !== note.column
	);
	notes.push({ ...note });
	notes.sort((left, right) => left.column - right.column || left.string - right.string);
	return { ...tab, notes };
}

export function removeTabNote(tab: SongTab, string: number, column: number): SongTab {
	return {
		...tab,
		notes: tab.notes.filter((note) => note.string !== string || note.column !== column)
	};
}

export function tabColumnCount(tab: SongTab, cursorColumn: number | null = 0): number {
	const lastNoteColumn = tab.notes.reduce((last, note) => Math.max(last, note.column), -1);
	const lastColumn = Math.max(lastNoteColumn, cursorColumn ?? -1);
	return Math.max(1, lastColumn + 2);
}

export function nextTabName(tabs: SongTab[]): string {
	const names = tabs.map(({ name }) => name.trim().toLowerCase());
	let index = 1;
	while (names.includes(`tablatura ${index}`)) index++;
	return `Tablatura ${index}`;
}

export interface TabPart {
	startColumn: number;
	columnCount: number;
}

export function splitTabColumns(tab: SongTab, columnsPerPart: number): TabPart[] {
	const notesWidth = tab.notes.reduce((last, note) => Math.max(last, note.column + 1), 0);
	const totalColumns = Math.max(1, notesWidth);
	const requestedWidth = Number.isFinite(columnsPerPart) ? Math.floor(columnsPerPart) : 1;
	const partWidth = Math.max(1, requestedWidth);
	const parts: TabPart[] = [];

	for (let startColumn = 0; startColumn < totalColumns; startColumn += partWidth) {
		parts.push({
			startColumn,
			columnCount: Math.min(partWidth, totalColumns - startColumn)
		});
	}

	return parts;
}
