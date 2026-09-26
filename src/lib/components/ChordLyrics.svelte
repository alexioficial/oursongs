<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import {
		lineVisualWidth,
		packChordRows,
		placementsForLine,
		splitGraphemes,
		splitLyricLines
	} from '$lib/music/chordPlacements';
	import {
		formatSemitones,
		resolveSpelling,
		transposeChord,
		wrapSemitones,
		type Accidentals
	} from '$lib/music/chords';
	import type { ChordPlacement, SongChord } from '$lib/types';
	import TransposeControls from './TransposeControls.svelte';

	interface Props {
		lyrics: string;
		chords: SongChord[];
		placements: ChordPlacement[];
		songId: string;
		onEdit: () => void;
		/** Sin conexión (o sin subir aún) no se ofrece editar ni alinear. */
		readOnly?: boolean;
	}

	let { lyrics, chords, placements, songId, onEdit, readOnly = false }: Props = $props();
	let semitones = $state(0);
	let accidentals = $state<Accidentals>('auto');

	const chordValues = $derived(chords.map(({ value }) => value));
	const spelling = $derived(resolveSpelling(chordValues, accidentals));
	const chordById = $derived(
		new SvelteMap(
			chords.map(({ id, value }) => [id, transposeChord(value, semitones, spelling)] as const)
		)
	);
	const lines = $derived(splitLyricLines(lyrics));
	const lineCount = $derived(lyrics ? lines.length : 0);
	const steps = $derived(wrapSemitones(semitones));
</script>

<section class="section">
	<div class="section-head">
		<div class="heading">
			<h2 class="section-label">Letra y acordes</h2>
			{#if lineCount > 0}
				<span class="muted line-count mono">
					{lineCount}
					{lineCount === 1 ? 'línea' : 'líneas'}
				</span>
			{/if}
		</div>

		{#if lyrics && placements.length > 0}
			<TransposeControls chords={chordValues} bind:semitones bind:accidentals />
		{/if}
	</div>

	{#if !lyrics}
		<p class="muted empty-lyrics">
			Esta canción todavía no tiene letra.
			{#if !readOnly}<button class="link-button" onclick={onEdit}>Añádela</button>.{/if}
		</p>
	{:else if placements.length === 0}
		<pre class="plain-lyrics">{lyrics}</pre>
		{#if !readOnly}
			<p class="alignment-hint muted">
				Los acordes todavía no están ubicados en la letra.
				<a href={resolve('/canciones/[id]/alinear', { id: songId })}>Alinearlos</a>
			</p>
		{/if}
	{:else}
		<div class="song-sheet" aria-label="Letra con acordes">
			{#each lines as line (line.start)}
				{@const graphemes = splitGraphemes(line.text)}
				{@const positioned = placementsForLine(line, placements, chordById)}
				{@const rows = packChordRows(positioned)}
				{@const columns = lineVisualWidth(line.text, positioned)}
				<div class="line-scroll">
					<div class="line-grid" style={`--columns: ${columns}; min-width: ${columns}ch`}>
						{#each rows as row, rowIndex (rowIndex)}
							<div class="chord-row">
								{#each row as chord (`${chord.offset}-${chord.chordId}`)}
									<span
										class="chord mono"
										style={`grid-column: ${chord.column + 1} / span ${Math.max(1, chord.label.length)}`}
									>
										{chord.label}
									</span>
								{/each}
							</div>
						{/each}
						<div class="text-row mono" class:blank={graphemes.length === 0}>
							{#each graphemes as grapheme, index (grapheme.offset)}
								<span style={`grid-column: ${index + 1}`}>
									{grapheme.text === ' ' ? '\u00a0' : grapheme.text}
								</span>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>

		<p class="hint transpose-hint">
			{#if steps === 0}
				Las flechas cambian la tonalidad solo en esta vista; la canción guardada no se modifica.
			{:else}
				Vista {formatSemitones(semitones)}
				{Math.abs(steps) === 1 ? 'semitono' : 'semitonos'} respecto a lo guardado.
			{/if}
		</p>
	{/if}
</section>

<style>
	.heading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.line-count {
		font-size: 0.78rem;
	}
	.song-sheet {
		display: grid;
		gap: 0.9rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-surface);
		overflow: hidden;
	}
	.line-scroll {
		overflow-x: auto;
		overflow-y: hidden;
	}
	.line-grid {
		display: grid;
		width: max-content;
	}
	.chord-row,
	.text-row {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1ch);
	}
	.chord-row {
		min-height: 1.35rem;
	}
	.chord {
		justify-self: start;
		color: var(--color-bright);
		font-size: 0.86rem;
		font-weight: 700;
		line-height: 1.25;
		white-space: nowrap;
	}
	.text-row {
		min-height: 1.55rem;
		color: var(--color-text);
		font-size: 1rem;
		line-height: 1.55;
		white-space: pre;
	}
	.text-row.blank {
		height: 0.65rem;
		min-height: 0.65rem;
	}
	.plain-lyrics {
		margin: 0;
		color: var(--color-text);
		font-family: var(--font-sans);
		font-size: 1rem;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
	.alignment-hint {
		margin: 1rem 0 0;
		font-size: 0.82rem;
	}
	.alignment-hint a {
		color: var(--color-text);
	}
	.empty-lyrics {
		margin: 0;
		font-size: 0.9rem;
	}
	.link-button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-text);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.transpose-hint {
		margin-top: 0.75rem;
	}
	@media (max-width: 520px) {
		.section-head {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
