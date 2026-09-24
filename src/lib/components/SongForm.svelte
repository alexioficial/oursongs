<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import TagPicker from './TagPicker.svelte';
	import { ClientApiError, jsonRequest } from '$lib/client/json';
	import { chordsFromText, chordsToText, isValidChord } from '$lib/music/chords';
	import { ARTIST_MAX_LENGTH, LYRICS_MAX_LENGTH, TITLE_MAX_LENGTH } from '$lib/validation';
	import type { Song, Tag } from '$lib/types';

	interface Props {
		/** Sin canción, el formulario crea una nueva. */
		song?: Song;
		tags: Tag[];
		onSaved: (song: Song) => void;
		onCancel: () => void;
	}
	let { song, tags, onSaved, onCancel }: Props = $props();

	// El formulario arranca con los datos de la canción y a partir de ahí es suyo:
	// `untrack` deja claro que solo interesa el valor inicial.
	let title = $state(untrack(() => song?.title ?? ''));
	let artist = $state(untrack(() => song?.artist ?? ''));
	let chordsText = $state(untrack(() => chordsToText(song?.chords ?? [])));
	let lyrics = $state(untrack(() => song?.lyrics ?? ''));
	let selectedTagIds = $state<string[]>(untrack(() => [...(song?.tagIds ?? [])]));
	let saving = $state(false);
	let error = $state<string | null>(null);

	const chords = $derived(chordsFromText(chordsText));
	const invalid = $derived(chords.filter((chord) => !isValidChord(chord)));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		if (invalid.length > 0) {
			error = `Esto no lo entiendo como acorde: ${invalid.join(', ')}`;
			return;
		}

		saving = true;
		error = null;
		const payload = {
			title: title.trim(),
			artist: artist.trim(),
			lyrics,
			chords,
			tagIds: selectedTagIds
		};

		try {
			const saved = song
				? await jsonRequest<Song>(`/api/songs/${song.id}`, 'PATCH', payload)
				: await jsonRequest<Song>('/api/songs', 'POST', payload);
			// `saving` se queda en true: quien nos llama navega o cierra el formulario.
			onSaved(saved);
		} catch (requestError) {
			error =
				requestError instanceof ClientApiError
					? requestError.message
					: 'No se pudo guardar la canción';
			saving = false;
		}
	}
</script>

<form onsubmit={submit} class="song-form">
	<div class="row">
		<div>
			<label class="label" for="song-title">Título</label>
			<input
				id="song-title"
				class="input"
				bind:value={title}
				maxlength={TITLE_MAX_LENGTH}
				placeholder="Nombre de la canción"
				required
			/>
		</div>
		<div>
			<label class="label" for="song-artist">Artista</label>
			<input
				id="song-artist"
				class="input"
				bind:value={artist}
				maxlength={ARTIST_MAX_LENGTH}
				placeholder="Opcional"
			/>
		</div>
	</div>

	<div class="field">
		<label class="label" for="song-chords">Acordes</label>
		<input
			id="song-chords"
			class="input mono"
			bind:value={chordsText}
			spellcheck="false"
			autocapitalize="none"
			autocorrect="off"
			placeholder="C G Am F"
		/>
		<p class="hint">
			Uno detrás de otro, separados por espacios, comas o "|". Se guardan en este orden.
		</p>

		{#if chords.length > 0}
			<div class="preview">
				{#each chords as chord, index (index)}
					<span class="preview-chord mono" class:bad={!isValidChord(chord)}>
						{chord}
						{#if !isValidChord(chord)}<Icon name="x" size={12} />{/if}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="field">
		<span class="label">Tags</span>
		<TagPicker {tags} bind:selected={selectedTagIds} />
	</div>

	<div class="field">
		<label class="label" for="song-lyrics">Letra</label>
		<textarea
			id="song-lyrics"
			class="input lyrics"
			bind:value={lyrics}
			maxlength={LYRICS_MAX_LENGTH}
			placeholder="Pega aquí la letra completa"></textarea>
	</div>

	{#if error}<p class="error-text">{error}</p>{/if}

	<div class="actions">
		<button type="button" class="btn btn-subtle" disabled={saving} onclick={onCancel}>
			Cancelar
		</button>
		<button type="submit" class="btn btn-primary" disabled={saving}>
			{#if saving}Guardando…{:else}<Icon name="check" size={16} /> Guardar{/if}
		</button>
	</div>
</form>

<style>
	.song-form {
		display: grid;
		gap: 1.25rem;
	}
	.row {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
	}
	.field {
		min-width: 0;
	}
	.lyrics {
		min-height: 14rem;
		font-size: 0.95rem;
	}
	.preview {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 0.625rem;
	}
	.preview-chord {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-text);
		font-size: 0.85rem;
	}
	.preview-chord.bad {
		border-color: var(--color-border-strong);
		border-style: dashed;
		color: var(--color-muted);
		text-decoration: line-through;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	@media (max-width: 420px) {
		.actions {
			flex-direction: column-reverse;
		}
		.actions .btn {
			width: 100%;
		}
	}
</style>
