import { isValidChord, normalizeChord } from './chords';
import type { SongChordInput } from '../types';

export function chordCatalogProblems(chords: SongChordInput[]): Array<string | null> {
	const seen = new Set<string>();
	return chords.map((chord) => {
		if (typeof chord.value !== 'string' || !isValidChord(chord.value)) {
			return 'No parece un acorde';
		}
		const normalized = normalizeChord(chord.value);
		if (seen.has(normalized)) return 'El acorde está repetido';
		seen.add(normalized);
		return null;
	});
}
