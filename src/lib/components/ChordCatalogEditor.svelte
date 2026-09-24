<script lang="ts">
	import Icon from './Icon.svelte';
	import { chordCatalogProblems } from '$lib/music/chordCatalog';
	import { isValidChord, normalizeChord } from '$lib/music/chords';
	import { MAX_CHORDS_PER_SONG } from '$lib/validation';
	import type { SongChordInput } from '$lib/types';

	interface Props {
		chords: SongChordInput[];
		assignedIds: string[];
		disabled?: boolean;
		onDeleteRequested: (chord: SongChordInput) => void;
	}

	let { chords = $bindable(), assignedIds, disabled = false, onDeleteRequested }: Props = $props();
	let newValue = $state('');
	let addError = $state<string | null>(null);

	const problems = $derived(chordCatalogProblems(chords));

	function addChord() {
		const value = newValue.trim();
		if (!isValidChord(value)) {
			addError = value ? 'No parece un acorde' : 'Escribe un acorde';
			return;
		}
		const normalized = normalizeChord(value);
		if (
			chords.some(
				(chord) =>
					typeof chord.value === 'string' &&
					isValidChord(chord.value) &&
					normalizeChord(chord.value) === normalized
			)
		) {
			addError = 'Ese acorde ya está en el catálogo';
			return;
		}
		if (chords.length >= MAX_CHORDS_PER_SONG) {
			addError = `No se pueden registrar más de ${MAX_CHORDS_PER_SONG} acordes`;
			return;
		}
		chords = [...chords, { value: normalized }];
		newValue = '';
		addError = null;
	}

	function updateChord(index: number, value: string) {
		chords = chords.map((chord, chordIndex) =>
			chordIndex === index ? { ...chord, value } : chord
		);
	}

	function removeChord(index: number) {
		const chord = chords[index];
		if (typeof chord.id === 'string' && assignedIds.includes(chord.id)) {
			onDeleteRequested(chord);
			return;
		}
		chords = chords.filter((_, chordIndex) => chordIndex !== index);
	}
</script>

<div class="catalog">
	<div class="add-row">
		<input
			id="song-chords"
			class="input mono"
			bind:value={newValue}
			{disabled}
			spellcheck="false"
			autocapitalize="none"
			autocorrect="off"
			placeholder="Am7"
			onkeydown={(event) => {
				if (event.key !== 'Enter') return;
				event.preventDefault();
				addChord();
			}}
		/>
		<button type="button" class="btn btn-ghost" {disabled} onclick={addChord}>
			<Icon name="plus" size={15} /> Añadir
		</button>
	</div>
	{#if addError}<p class="error-text">{addError}</p>{/if}

	{#if chords.length > 0}
		<ul class="chord-list">
			{#each chords as chord, index (typeof chord.id === 'string' ? chord.id : index)}
				<li class:invalid={problems[index] !== null}>
					<input
						class="chord-value mono"
						value={typeof chord.value === 'string' ? chord.value : ''}
						{disabled}
						spellcheck="false"
						autocapitalize="none"
						autocorrect="off"
						aria-label={`Acorde ${index + 1}`}
						oninput={(event) => updateChord(index, (event.currentTarget as HTMLInputElement).value)}
					/>
					<button
						type="button"
						class="remove"
						{disabled}
						aria-label={`Quitar ${String(chord.value ?? 'acorde')}`}
						onclick={() => removeChord(index)}
					>
						<Icon name="x" size={14} />
					</button>
					{#if problems[index]}<span class="problem">{problems[index]}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.catalog {
		display: grid;
		gap: 0.625rem;
	}
	.add-row {
		display: flex;
		gap: 0.5rem;
	}
	.chord-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chord-list li {
		display: grid;
		grid-template-columns: minmax(4.5rem, auto) 2.25rem;
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-surface-2);
		overflow: hidden;
	}
	.chord-list li.invalid {
		border-color: var(--color-border-strong);
		border-style: dashed;
	}
	.chord-value {
		width: 7rem;
		min-width: 0;
		padding: 0.45rem 0.625rem;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--color-text);
	}
	.remove {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border: 0;
		border-left: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-muted);
		cursor: pointer;
	}
	.problem {
		grid-column: 1 / -1;
		padding: 0 0.625rem 0.375rem;
		color: var(--color-subtle);
		font-size: 0.7rem;
	}
	@media (max-width: 420px) {
		.add-row {
			align-items: stretch;
			flex-direction: column;
		}
		.add-row .btn {
			width: 100%;
		}
	}
</style>
