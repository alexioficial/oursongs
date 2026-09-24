<script lang="ts">
	import { untrack } from 'svelte';
	import ChordCatalogEditor from './ChordCatalogEditor.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Icon from './Icon.svelte';
	import TagPicker from './TagPicker.svelte';
	import { ClientApiError, jsonRequest } from '$lib/client/json';
	import { chordCatalogProblems } from '$lib/music/chordCatalog';
	import { remapPlacements, removePlacementsForChord } from '$lib/music/chordPlacements';
	import { ARTIST_MAX_LENGTH, LYRICS_MAX_LENGTH, TITLE_MAX_LENGTH } from '$lib/validation';
	import type { ChordPlacement, Song, SongChordInput, Tag } from '$lib/types';

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
	let chords = $state<SongChordInput[]>(
		untrack(() => song?.chords.map((chord) => ({ ...chord })) ?? [])
	);
	let lyrics = $state(untrack(() => song?.lyrics ?? ''));
	let chordPlacements = $state<ChordPlacement[]>(
		untrack(() => song?.chordPlacements.map((placement) => ({ ...placement })) ?? [])
	);
	let selectedTagIds = $state<string[]>(untrack(() => [...(song?.tagIds ?? [])]));
	let pendingChordDelete = $state<SongChordInput | null>(null);
	let placementsNeedReview = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);

	const chordProblems = $derived(chordCatalogProblems(chords));
	const assignedIds = $derived(chordPlacements.map(({ chordId }) => chordId));

	function updateLyrics(event: Event) {
		const nextLyrics = (event.currentTarget as HTMLTextAreaElement).value;
		const remapped = remapPlacements(lyrics, nextLyrics, chordPlacements);
		lyrics = nextLyrics;
		chordPlacements = remapped.placements;
		placementsNeedReview ||= remapped.needsReview;
	}

	function deletePendingChord() {
		const chord = pendingChordDelete;
		if (!chord || typeof chord.id !== 'string') return;
		chords = chords.filter((current) => current.id !== chord.id);
		chordPlacements = removePlacementsForChord(chordPlacements, chord.id);
		pendingChordDelete = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		if (chordProblems.some((problem) => problem !== null)) {
			error = 'Corrige los acordes marcados antes de guardar';
			return;
		}

		saving = true;
		error = null;
		const normalizedLyrics = lyrics.replace(/\r\n?/g, '\n').trim();
		const normalizedPlacements = remapPlacements(
			lyrics,
			normalizedLyrics,
			chordPlacements
		).placements;
		const payload = {
			title: title.trim(),
			artist: artist.trim(),
			lyrics: normalizedLyrics,
			chords,
			chordPlacements: normalizedPlacements,
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
		<ChordCatalogEditor
			bind:chords
			{assignedIds}
			disabled={saving}
			onDeleteRequested={(chord) => (pendingChordDelete = chord)}
		/>
		<p class="hint">
			Registra una vez cada acorde que se usa. Después podrás alinearlo con la letra.
		</p>
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
			value={lyrics}
			oninput={updateLyrics}
			maxlength={LYRICS_MAX_LENGTH}
			placeholder="Pega aquí la letra completa"></textarea>
		{#if placementsNeedReview}
			<p class="hint review-warning">
				La letra cambió alrededor de un acorde. Revisa su alineación cuando guardes.
			</p>
		{/if}
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

<ConfirmDialog
	open={pendingChordDelete !== null}
	title="¿Quitar el acorde?"
	message="Este acorde ya está colocado en la letra. ¿Quieres quitar también todas sus apariciones?"
	confirmLabel="Quitar"
	onConfirm={deletePendingChord}
	onCancel={() => (pendingChordDelete = null)}
/>

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
	.review-warning {
		color: var(--color-subtle);
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
