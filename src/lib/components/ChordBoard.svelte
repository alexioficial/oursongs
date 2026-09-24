<script lang="ts">
	import Icon from './Icon.svelte';
	import {
		formatSemitones,
		resolveSpelling,
		transposeChords,
		wrapSemitones,
		type Accidentals
	} from '$lib/music/chords';

	interface Props {
		chords: string[];
	}
	let { chords }: Props = $props();

	// Todo esto vive solo en la vista: no se manda al servidor ni se guarda.
	let semitones = $state(0);
	let accidentals = $state<Accidentals>('auto');

	const steps = $derived(wrapSemitones(semitones));
	const transposed = $derived(steps !== 0);
	const shown = $derived(transposeChords(chords, semitones, accidentals));
	/** La escritura que se está usando de verdad, aunque el modo sea 'auto'. */
	const spelling = $derived(resolveSpelling(chords, accidentals));

	function shift(step: number) {
		semitones = wrapSemitones(semitones + step);
	}
</script>

<section class="section">
	<div class="section-head">
		<h2 class="section-label">Acordes</h2>

		<div class="controls">
			<div class="spelling" role="group" aria-label="Escritura de las alteraciones">
				<button
					type="button"
					class="chip spell"
					aria-pressed={spelling === 'sharp'}
					title="Escribir con sostenidos"
					onclick={() => (accidentals = 'sharp')}
				>
					♯
				</button>
				<button
					type="button"
					class="chip spell"
					aria-pressed={spelling === 'flat'}
					title="Escribir con bemoles"
					onclick={() => (accidentals = 'flat')}
				>
					♭
				</button>
			</div>

			<div class="stepper" role="group" aria-label="Transponer">
				<button
					type="button"
					class="icon-btn"
					title="Bajar un semitono"
					aria-label="Bajar un semitono"
					onclick={() => shift(-1)}
				>
					<Icon name="down" size={18} />
				</button>
				<span class="steps mono" aria-live="polite">{formatSemitones(semitones)}</span>
				<button
					type="button"
					class="icon-btn"
					title="Subir un semitono"
					aria-label="Subir un semitono"
					onclick={() => shift(1)}
				>
					<Icon name="up" size={18} />
				</button>
				<button
					type="button"
					class="icon-btn"
					title="Volver al original"
					aria-label="Volver al original"
					disabled={!transposed}
					onclick={() => (semitones = 0)}
				>
					<Icon name="reset" size={17} />
				</button>
			</div>
		</div>
	</div>

	{#if chords.length === 0}
		<p class="muted no-chords">Esta canción todavía no tiene acordes.</p>
	{:else}
		<ol class="chords">
			{#each shown as chord, index (index)}
				<li class="chord" class:changed={transposed && chord !== chords[index]}>
					<span class="chord-name mono">{chord}</span>
					{#if transposed && chord !== chords[index]}
						<span class="chord-original mono">{chords[index]}</span>
					{/if}
				</li>
			{/each}
		</ol>

		<p class="hint">
			{#if transposed}
				Vista {formatSemitones(semitones)}
				{Math.abs(steps) === 1 ? 'semitono' : 'semitonos'} sobre lo guardado (debajo, el acorde original).
				La canción no se modifica.
			{:else}
				Con las flechas subes o bajas la vista de semitono en semitono. Lo guardado no cambia.
			{/if}
		</p>
	{/if}
</section>

<style>
	.controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.spelling {
		display: flex;
		gap: 0.25rem;
	}
	.spell {
		min-width: 2.25rem;
		justify-content: center;
		font-size: 1rem;
		line-height: 1;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-surface);
	}
	.stepper .icon-btn {
		width: 2.5rem;
		height: 2.5rem;
	}
	.steps {
		min-width: 2.25rem;
		color: var(--color-bright);
		font-size: 0.9rem;
		font-weight: 600;
		text-align: center;
	}
	.no-chords {
		margin: 0;
		font-size: 0.9rem;
	}
	.chords {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chord {
		display: grid;
		gap: 0.125rem;
		place-items: center;
		min-width: 4rem;
		padding: 0.625rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-surface);
	}
	.chord.changed {
		border-color: var(--color-border-strong);
	}
	.chord-name {
		color: var(--color-bright);
		font-size: 1.05rem;
		font-weight: 600;
		line-height: 1.1;
		white-space: nowrap;
	}
	.chord-original {
		color: var(--color-muted);
		font-size: 0.7rem;
		line-height: 1;
		white-space: nowrap;
	}
	@media (max-width: 520px) {
		.controls {
			width: 100%;
			justify-content: space-between;
			gap: 0.5rem;
		}
	}
</style>
