<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import { ClientApiError, jsonRequest } from '$lib/client/json';
	import {
		movePlacement,
		packChordRows,
		placementOffsets,
		placementsForLine,
		splitGraphemes,
		splitLyricLines,
		upsertPlacement
	} from '$lib/music/chordPlacements';
	import type { Song } from '$lib/types';

	interface Props {
		song: Song;
		onSaved: (song: Song) => void;
		onCancel: () => void;
	}

	let { song, onSaved, onCancel }: Props = $props();
	let placements = $state(
		untrack(() => song.chordPlacements.map((placement) => ({ ...placement })))
	);
	let selectedOffset = $state(0);
	let saving = $state(false);
	let error = $state<string | null>(null);

	const chordById = $derived(new SvelteMap(song.chords.map((chord) => [chord.id, chord.value])));
	const lines = $derived(splitLyricLines(song.lyrics));
	const validOffsets = $derived(placementOffsets(song.lyrics));
	const selectedPlacement = $derived(
		placements.find((placement) => placement.offset === selectedOffset)
	);

	function selectChord(chordId: string) {
		placements = upsertPlacement(placements, { chordId, offset: selectedOffset });
	}

	function canMove(direction: -1 | 1): boolean {
		if (!selectedPlacement) return false;
		const index = validOffsets.indexOf(selectedOffset);
		const target = validOffsets[index + direction];
		return target !== undefined && !placements.some(({ offset }) => offset === target);
	}

	function shift(direction: -1 | 1) {
		if (!canMove(direction)) return;
		const index = validOffsets.indexOf(selectedOffset);
		const target = validOffsets[index + direction];
		placements = movePlacement(placements, selectedOffset, direction, song.lyrics);
		selectedOffset = target;
	}

	function removeSelected() {
		placements = placements.filter(({ offset }) => offset !== selectedOffset);
	}

	async function save() {
		if (saving) return;
		saving = true;
		error = null;
		try {
			const saved = await jsonRequest<Song>(`/api/songs/${song.id}`, 'PATCH', {
				chordPlacements: placements
			});
			onSaved(saved);
		} catch (requestError) {
			error =
				requestError instanceof ClientApiError
					? requestError.message
					: 'No se pudo guardar la alineación';
			saving = false;
		}
	}
</script>

{#if !song.lyrics}
	<div class="card missing">
		<p>Añade la letra antes de alinear acordes.</p>
		<a class="btn btn-primary" href={resolve('/canciones/[id]', { id: song.id })}>Editar canción</a>
	</div>
{:else if song.chords.length === 0}
	<div class="card missing">
		<p>Registra los acordes antes de alinearlos.</p>
		<a class="btn btn-primary" href={resolve('/canciones/[id]', { id: song.id })}>Editar canción</a>
	</div>
{:else}
	<div class="alignment-editor">
		<section class="palette-wrap" aria-label="Catálogo de acordes">
			<p class="label">Elige un acorde</p>
			<div class="palette">
				{#each song.chords as chord (chord.id)}
					<button
						type="button"
						class="chip mono"
						aria-pressed={selectedPlacement?.chordId === chord.id}
						disabled={saving}
						onclick={() => selectChord(chord.id)}
					>
						{chord.value}
					</button>
				{/each}
			</div>
		</section>

		<div class="status muted mono" aria-live="polite">Posición {selectedOffset}</div>

		<div class="lyrics-editor" aria-label="Letra para alinear">
			{#each lines as line (line.start)}
				{@const graphemes = splitGraphemes(line.text)}
				{@const positioned = placementsForLine(line, placements, chordById)}
				{@const rows = packChordRows(positioned)}
				{@const columns = Math.max(
					graphemes.length + 1,
					...positioned.map((chord) => chord.column + chord.label.length)
				)}
				<div class="line-scroll">
					<div class="line-grid" style={`--columns: ${columns}; min-width: ${columns}ch`}>
						{#each rows as row, rowIndex (rowIndex)}
							<div class="chord-row">
								{#each row as chord (`${chord.offset}-${chord.chordId}`)}
									<button
										type="button"
										class="placed-chord mono"
										class:selected={selectedOffset === chord.offset}
										style={`grid-column: ${chord.column + 1} / span ${Math.max(1, chord.label.length)}`}
										disabled={saving}
										onclick={() => (selectedOffset = chord.offset)}
									>
										{chord.label}
									</button>
								{/each}
							</div>
						{/each}
						<div class="text-row mono">
							{#each graphemes as grapheme (grapheme.offset)}
								<button
									type="button"
									class="character"
									class:selected={selectedOffset === line.start + grapheme.offset}
									style={`grid-column: ${graphemes.indexOf(grapheme) + 1}`}
									tabindex="-1"
									aria-label={`Colocar antes de ${grapheme.text === ' ' ? 'un espacio' : grapheme.text}`}
									disabled={saving}
									onclick={() => (selectedOffset = line.start + grapheme.offset)}
								>
									{grapheme.text === ' ' ? '\u00a0' : grapheme.text}
								</button>
							{/each}
							<button
								type="button"
								class="character end"
								class:selected={selectedOffset === line.end}
								style={`grid-column: ${graphemes.length + 1}`}
								tabindex="-1"
								aria-label="Colocar al final de la línea"
								disabled={saving}
								onclick={() => (selectedOffset = line.end)}
							>
								&nbsp;
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<div class="placement-actions">
			<button
				type="button"
				class="btn btn-subtle"
				disabled={saving || !canMove(-1)}
				onclick={() => shift(-1)}
			>
				<Icon name="back" size={15} /> Mover a la izquierda
			</button>
			<button
				type="button"
				class="btn btn-subtle"
				disabled={saving || !canMove(1)}
				onclick={() => shift(1)}
			>
				Mover a la derecha <Icon name="chevron" size={15} />
			</button>
			<button
				type="button"
				class="btn btn-danger"
				disabled={saving || !selectedPlacement}
				onclick={removeSelected}
			>
				<Icon name="trash" size={15} /> Quitar
			</button>
		</div>

		{#if error}<p class="error-text">{error}</p>{/if}

		<div class="save-actions">
			<button type="button" class="btn btn-subtle" disabled={saving} onclick={onCancel}>
				Cancelar
			</button>
			<button type="button" class="btn btn-primary" disabled={saving} onclick={save}>
				{#if saving}Guardando…{:else}<Icon name="check" size={16} /> Guardar alineación{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.alignment-editor {
		display: grid;
		gap: 1rem;
	}
	.palette-wrap {
		position: sticky;
		top: 3.75rem;
		z-index: 20;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: color-mix(in srgb, var(--color-bg) 96%, transparent);
		backdrop-filter: blur(10px);
	}
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.palette .chip {
		min-height: 2.75rem;
	}
	.status {
		font-size: 0.78rem;
	}
	.lyrics-editor {
		display: grid;
		gap: 0.875rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-surface);
	}
	.line-scroll {
		padding-block: 0.125rem;
		overflow-x: auto;
	}
	.line-grid {
		display: grid;
		gap: 0.125rem;
		width: max-content;
	}
	.chord-row,
	.text-row {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1ch);
	}
	.placed-chord {
		justify-self: start;
		padding: 0.125rem 0.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-elevated);
		color: var(--color-bright);
		font-size: 0.8rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
	}
	.placed-chord.selected {
		border-color: var(--color-bright);
	}
	.character {
		min-width: 1ch;
		height: 1.7rem;
		padding: 0;
		border: 0;
		border-left: 1px solid transparent;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		line-height: 1.7rem;
		text-align: left;
		white-space: pre;
		cursor: text;
	}
	.character.selected {
		border-left-color: var(--color-bright);
		background: var(--color-elevated);
	}
	.character.end {
		border-right: 1px solid var(--color-border-soft);
	}
	.placement-actions,
	.save-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.save-actions {
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}
	.missing {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
	}
	.missing p {
		margin: 0;
	}
	@media (min-width: 960px) {
		.palette-wrap {
			top: 1rem;
		}
	}
	@media (max-width: 560px) {
		.placement-actions .btn,
		.save-actions .btn {
			width: 100%;
		}
		.missing {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
