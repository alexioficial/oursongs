<script lang="ts">
	import { tick, untrack } from 'svelte';
	import ChordCatalogEditor from './ChordCatalogEditor.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Icon from './Icon.svelte';
	import TagPicker from './TagPicker.svelte';
	import { createId } from '$lib/client/ids';
	import { ClientApiError, jsonRequest } from '$lib/client/json';
	import { chordCatalogProblems } from '$lib/music/chordCatalog';
	import {
		remapPlacements,
		removePlacementsForChord,
		splicePlacements,
		trimLyrics
	} from '$lib/music/chordPlacements';
	import { applyChordSheet, parseChordSheet } from '$lib/music/chordSheet';
	import {
		ARTIST_MAX_LENGTH,
		LYRICS_MAX_LENGTH,
		MAX_CHORD_PLACEMENTS_PER_SONG,
		MAX_CHORDS_PER_SONG,
		RHYTHM_MAX_LENGTH,
		TITLE_MAX_LENGTH
	} from '$lib/validation';
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
	let rhythm = $state(untrack(() => song?.rhythm ?? ''));
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

	let lyricsInput = $state<HTMLTextAreaElement>();

	/**
	 * Lo último que se importó al pegar, con lo que había antes: permite
	 * deshacerlo y pegar el texto tal cual si la detección se equivocó.
	 */
	interface PastedImport {
		raw: string;
		start: number;
		end: number;
		placed: number;
		added: number;
		before: {
			lyrics: string;
			chords: SongChordInput[];
			chordPlacements: ChordPlacement[];
			placementsNeedReview: boolean;
		};
	}
	let pastedImport = $state<PastedImport | null>(null);
	const importSummary = $derived.by(() => {
		if (!pastedImport) return '';
		const { placed, added } = pastedImport;
		const placedText = `Se ${placed === 1 ? 'colocó 1 acorde' : `colocaron ${placed} acordes`} sobre la letra`;
		if (added === 0) return `${placedText}.`;
		return `${placedText} y ${added === 1 ? 'se añadió 1' : `se añadieron ${added}`} al catálogo.`;
	});

	const chordProblems = $derived(chordCatalogProblems(chords));
	const assignedIds = $derived(chordPlacements.map(({ chordId }) => chordId));

	function updateLyrics(event: Event) {
		const nextLyrics = (event.currentTarget as HTMLTextAreaElement).value;
		const remapped = remapPlacements(lyrics, nextLyrics, chordPlacements);
		lyrics = nextLyrics;
		chordPlacements = remapped.placements;
		placementsNeedReview ||= remapped.needsReview;
		// Tras seguir escribiendo, deshacer la importación borraría lo escrito.
		pastedImport = null;
	}

	async function placeCaret(position: number) {
		await tick();
		lyricsInput?.focus();
		lyricsInput?.setSelectionRange(position, position);
	}

	/**
	 * Si lo pegado es una letra con los acordes encima (o en formato ChordPro),
	 * se separa: la letra va al texto y cada acorde al catálogo y a su posición.
	 * Si no lo parece, el navegador pega como siempre.
	 */
	function pasteLyrics(event: ClipboardEvent) {
		const raw = event.clipboardData?.getData('text/plain');
		const sheet = raw ? parseChordSheet(raw) : null;
		if (!raw || !sheet || !lyricsInput) return;

		const { selectionStart: start, selectionEnd: end } = lyricsInput;
		const result = applyChordSheet(
			{ lyrics, chords, placements: chordPlacements },
			sheet,
			start,
			end,
			createId
		);
		// Pasarse de algún límite haría fallar el guardado entero: mejor pegar el
		// texto sin más y que el usuario decida.
		if (
			result.lyrics.length > LYRICS_MAX_LENGTH ||
			result.chords.length > MAX_CHORDS_PER_SONG ||
			result.placements.length > MAX_CHORD_PLACEMENTS_PER_SONG
		) {
			return;
		}

		event.preventDefault();
		pastedImport = {
			raw,
			start,
			end,
			placed: sheet.placements.length,
			added: result.added,
			before: { lyrics, chords, chordPlacements, placementsNeedReview }
		};
		lyrics = result.lyrics;
		chords = result.chords;
		chordPlacements = result.placements;
		placementsNeedReview ||= result.dropped;
		placeCaret(start + sheet.lyrics.length);
	}

	function pasteAsPlainText() {
		if (!pastedImport) return;
		const { raw, start, end, before } = pastedImport;
		const text = raw.replace(/\r\n?/g, '\n');
		const spliced = splicePlacements(before.chordPlacements, start, end, text.length);
		lyrics = before.lyrics.slice(0, start) + text + before.lyrics.slice(end);
		chords = before.chords;
		chordPlacements = spliced.placements;
		placementsNeedReview = before.placementsNeedReview || spliced.dropped;
		pastedImport = null;
		placeCaret(start + text.length);
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
		const trimmed = trimLyrics(lyrics, chordPlacements);
		const payload = {
			title: title.trim(),
			artist: artist.trim(),
			rhythm: rhythm.trim(),
			lyrics: trimmed.lyrics,
			chords,
			chordPlacements: trimmed.placements,
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
		<div>
			<label class="label" for="song-rhythm">Ritmo</label>
			<input
				id="song-rhythm"
				class="input"
				bind:value={rhythm}
				maxlength={RHYTHM_MAX_LENGTH}
				placeholder="4/4, merengue, 6/8 lento…"
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
			bind:this={lyricsInput}
			oninput={updateLyrics}
			onpaste={pasteLyrics}
			maxlength={LYRICS_MAX_LENGTH}
			placeholder="Pega aquí la letra completa, con los acordes encima si los tiene"></textarea>
		{#if pastedImport}
			<p class="hint import-notice">
				<Icon name="check" size={14} />
				<span>{importSummary}</span>
				<button type="button" class="link-button" onclick={pasteAsPlainText}>
					Pegar como texto
				</button>
			</p>
		{/if}
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
	.import-notice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		color: var(--color-subtle);
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
