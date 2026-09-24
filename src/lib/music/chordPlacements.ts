import type { ChordPlacement } from '../types';

export interface GraphemePart {
	text: string;
	offset: number;
	end: number;
}

export interface LyricLine {
	text: string;
	start: number;
	end: number;
}

export interface PlacementRemapResult {
	placements: ChordPlacement[];
	needsReview: boolean;
}

export interface PositionedChord extends ChordPlacement {
	column: number;
	label: string;
}

const graphemeSegmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });

export function splitGraphemes(text: string): GraphemePart[] {
	return [...graphemeSegmenter.segment(text)].map(({ segment, index }) => ({
		text: segment,
		offset: index,
		end: index + segment.length
	}));
}

export function placementOffsets(text: string): number[] {
	return [...splitGraphemes(text).map(({ offset }) => offset), text.length];
}

export function splitLyricLines(lyrics: string): LyricLine[] {
	const lines: LyricLine[] = [];
	let start = 0;
	for (const text of lyrics.split('\n')) {
		lines.push({ text, start, end: start + text.length });
		start += text.length + 1;
	}
	return lines;
}

function dedupePlacements(placements: ChordPlacement[]): ChordPlacement[] {
	const byOffset = new Map<number, ChordPlacement>();
	for (const placement of placements) byOffset.set(placement.offset, placement);
	return [...byOffset.values()].sort((a, b) => a.offset - b.offset);
}

export function remapPlacements(
	before: string,
	after: string,
	placements: ChordPlacement[]
): PlacementRemapResult {
	if (before === after)
		return { placements: placements.map((value) => ({ ...value })), needsReview: false };

	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;

	let beforeEnd = before.length;
	let afterEnd = after.length;
	while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
		beforeEnd--;
		afterEnd--;
	}

	const delta = afterEnd - beforeEnd;
	let needsReview = false;
	const next = placements.map((placement) => {
		let offset = placement.offset;
		if (offset > start && offset < beforeEnd) {
			needsReview = true;
			const leftDistance = offset - start;
			const rightDistance = beforeEnd - offset;
			offset = leftDistance < rightDistance ? start : afterEnd;
		} else if (
			(beforeEnd === start && offset >= start) ||
			(beforeEnd !== start && offset >= beforeEnd && offset > start)
		) {
			offset += delta;
		}
		return { ...placement, offset: Math.max(0, Math.min(after.length, offset)) };
	});

	return { placements: dedupePlacements(next), needsReview };
}

export function upsertPlacement(
	placements: ChordPlacement[],
	placement: ChordPlacement
): ChordPlacement[] {
	return [...placements.filter(({ offset }) => offset !== placement.offset), placement].sort(
		(a, b) => a.offset - b.offset
	);
}

export function removePlacementsForChord(
	placements: ChordPlacement[],
	chordId: string
): ChordPlacement[] {
	return placements.filter((placement) => placement.chordId !== chordId);
}

export function movePlacement(
	placements: ChordPlacement[],
	currentOffset: number,
	direction: -1 | 1,
	lyrics: string
): ChordPlacement[] {
	const offsets = placementOffsets(lyrics);
	const currentIndex = offsets.indexOf(currentOffset);
	const targetOffset = offsets[currentIndex + direction];
	if (
		currentIndex === -1 ||
		targetOffset === undefined ||
		placements.some(({ offset }) => offset === targetOffset)
	) {
		return placements.map((placement) => ({ ...placement }));
	}
	return placements
		.map((placement) =>
			placement.offset === currentOffset ? { ...placement, offset: targetOffset } : { ...placement }
		)
		.sort((a, b) => a.offset - b.offset);
}

export function placementsForLine(
	line: LyricLine,
	placements: ChordPlacement[],
	chordById: ReadonlyMap<string, string>
): PositionedChord[] {
	const graphemes = splitGraphemes(line.text);
	return placements
		.filter(({ offset }) => offset >= line.start && offset <= line.end)
		.flatMap((placement) => {
			const label = chordById.get(placement.chordId);
			if (!label) return [];
			const localOffset = placement.offset - line.start;
			const column = graphemes.filter(({ offset }) => offset < localOffset).length;
			return [{ ...placement, column, label }];
		})
		.sort((a, b) => a.column - b.column);
}

export function packChordRows(items: PositionedChord[]): PositionedChord[][] {
	const rows: PositionedChord[][] = [];
	const nextColumns: number[] = [];

	for (const item of [...items].sort((a, b) => a.column - b.column)) {
		let rowIndex = nextColumns.findIndex((column) => item.column >= column);
		if (rowIndex === -1) {
			rowIndex = rows.length;
			rows.push([]);
		}
		rows[rowIndex].push(item);
		nextColumns[rowIndex] = item.column + item.label.length + 1;
	}

	return rows;
}
