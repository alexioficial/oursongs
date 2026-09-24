<script lang="ts">
	import Icon from './Icon.svelte';
	import {
		formatSemitones,
		resolveSpelling,
		wrapSemitones,
		type Accidentals
	} from '$lib/music/chords';

	interface Props {
		chords: string[];
		semitones: number;
		accidentals: Accidentals;
	}

	let { chords, semitones = $bindable(), accidentals = $bindable() }: Props = $props();

	const steps = $derived(wrapSemitones(semitones));
	const spelling = $derived(resolveSpelling(chords, accidentals));

	function shift(step: number) {
		semitones = wrapSemitones(semitones + step);
	}
</script>

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
			disabled={steps === 0}
			onclick={() => (semitones = 0)}
		>
			<Icon name="reset" size={17} />
		</button>
	</div>
</div>

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
	@media (max-width: 520px) {
		.controls {
			width: 100%;
			justify-content: space-between;
			gap: 0.5rem;
		}
	}
</style>
