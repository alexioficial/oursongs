<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SongForm from '$lib/components/SongForm.svelte';
	import { filterSongs, pendingToSong, toSummary } from '$lib/offline/logic';
	import { pending } from '$lib/offline/sync.svelte';
	import type { Song } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let creating = $state(false);
	let searchValue = $state(untrack(() => data.search));
	/** Lo último que mandamos a la URL, para no pisar lo que se está escribiendo. */
	let lastSent = $state(untrack(() => data.search));
	let debounce: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		// Resincronizamos solo si la URL cambió por fuera (atrás/adelante, un
		// enlace); si el cambio salió de este input, ya está escrito.
		if (data.search !== lastSent) {
			lastSent = data.search;
			searchValue = data.search;
		}
	});

	const tagsById = $derived(new Map(data.tags.map((tag) => [tag.id, tag])));
	// Lo creado sin conexión va arriba, con la misma búsqueda que el resto.
	const pendingSongs = $derived(
		filterSongs(
			pending.songs.map((song) => ({
				...toSummary(pendingToSong(song)),
				failed: song.error !== undefined
			})),
			data.search,
			data.tagIds
		)
	);
	const total = $derived(data.songs.length + pendingSongs.length);
	const filtering = $derived(data.search !== '' || data.tagIds.length > 0);

	function apply(search: string, tagIds: string[]) {
		const clean = search.trim();
		const parts: string[] = [];
		if (clean) parts.push(`q=${encodeURIComponent(clean)}`);
		for (const id of tagIds) parts.push(`tag=${encodeURIComponent(id)}`);

		lastSent = clean;
		const query = parts.join('&');
		// Los filtros viven en la URL: así un enlace o el botón de atrás devuelven
		// exactamente la misma lista.
		const target = query ? resolve(`/canciones?${query}`) : resolve('/canciones');
		goto(target, { keepFocus: true, noScroll: true, replaceState: true });
	}

	function onSearchInput() {
		clearTimeout(debounce);
		debounce = setTimeout(() => apply(searchValue, data.tagIds), 250);
	}

	function toggleTag(id: string) {
		clearTimeout(debounce);
		const next = data.tagIds.includes(id)
			? data.tagIds.filter((value) => value !== id)
			: [...data.tagIds, id];
		apply(searchValue, next);
	}

	function clearFilters() {
		clearTimeout(debounce);
		searchValue = '';
		apply('', []);
	}

	async function onCreated(song: Song) {
		creating = false;
		await goto(resolve('/canciones/[id]', { id: song.id }));
	}
</script>

<svelte:head><title>Canciones · OurSongs</title></svelte:head>

<PageHeader title="Canciones" subtitle={total === 1 ? '1 canción' : `${total} canciones`}>
	{#snippet action()}
		<button class="btn btn-primary" onclick={() => (creating = true)}>
			<Icon name="plus" size={16} /> Nueva
		</button>
	{/snippet}
</PageHeader>

<div class="filters">
	<div class="search">
		<span class="search-icon"><Icon name="search" size={17} /></span>
		<input
			class="input search-input"
			type="search"
			placeholder="Buscar por título o artista"
			bind:value={searchValue}
			oninput={onSearchInput}
			aria-label="Buscar canciones"
		/>
	</div>

	{#if data.tags.length > 0}
		<div class="tag-filter">
			{#each data.tags as tag (tag.id)}
				<button
					type="button"
					class="chip"
					aria-pressed={data.tagIds.includes(tag.id)}
					onclick={() => toggleTag(tag.id)}
				>
					{tag.name}
				</button>
			{/each}
		</div>
	{/if}
</div>

{#if total === 0}
	{#if filtering}
		<EmptyState
			icon="search"
			title="Sin resultados"
			message="Ninguna canción coincide con la búsqueda y los tags elegidos."
		>
			<button class="btn btn-ghost" onclick={clearFilters}>Quitar filtros</button>
		</EmptyState>
	{:else}
		<EmptyState
			title="Todavía no hay canciones"
			message="Registra la primera con su letra y sus acordes."
		>
			<button class="btn btn-primary" onclick={() => (creating = true)}>
				<Icon name="plus" size={16} /> Nueva canción
			</button>
		</EmptyState>
	{/if}
{:else}
	<ul class="song-list">
		{#each pendingSongs as song (song.id)}
			<li>
				<a class="card card-hover song" href={resolve('/canciones/[id]', { id: song.id })}>
					<div class="song-main">
						<h2 class="song-title">{song.title}</h2>
						{#if song.artist || song.rhythm}
							<p class="song-artist muted">
								{[song.artist, song.rhythm].filter(Boolean).join(' · ')}
							</p>
						{/if}
					</div>
					<div class="song-side">
						<span class="badge pending-badge">{song.failed ? 'No se pudo subir' : 'Sin subir'}</span
						>
						<Icon name="chevron" size={16} />
					</div>
				</a>
			</li>
		{/each}
		{#each data.songs as song (song.id)}
			<li>
				<a class="card card-hover song" href={resolve('/canciones/[id]', { id: song.id })}>
					<div class="song-main">
						<h2 class="song-title">{song.title}</h2>
						{#if song.artist || song.rhythm}
							<p class="song-artist muted">
								{[song.artist, song.rhythm].filter(Boolean).join(' · ')}
							</p>
						{/if}
						{#if song.tagIds.length > 0}
							<div class="song-tags">
								{#each song.tagIds as tagId (tagId)}
									{@const tag = tagsById.get(tagId)}
									{#if tag}<span class="badge">{tag.name}</span>{/if}
								{/each}
							</div>
						{/if}
					</div>

					<div class="song-side">
						<span class="chord-count mono">
							{song.chords.length}
							{song.chords.length === 1 ? 'acorde' : 'acordes'}
						</span>
						<Icon name="chevron" size={16} />
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}

{#if creating}
	<Modal title="Nueva canción" onClose={() => (creating = false)}>
		<SongForm tags={data.tags} onSaved={onCreated} onCancel={() => (creating = false)} />
	</Modal>
{/if}

<style>
	.filters {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.search {
		position: relative;
	}
	.search-icon {
		position: absolute;
		top: 50%;
		left: 0.75rem;
		display: grid;
		place-items: center;
		color: var(--color-muted);
		transform: translateY(-50%);
		pointer-events: none;
	}
	.search-input {
		padding-left: 2.5rem;
	}
	.search-input::-webkit-search-cancel-button {
		filter: invert(1) opacity(0.5);
	}
	/* La X nativa ya es oscura en el tema claro: invertirla la dejaría blanca. */
	:global(:root[data-theme='light']) .search-input::-webkit-search-cancel-button {
		filter: opacity(0.5);
	}
	.tag-filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.song-list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.song {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1rem;
		color: inherit;
		text-decoration: none;
	}
	.song-main {
		min-width: 0;
	}
	.song-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		line-height: 1.25;
		overflow-wrap: break-word;
	}
	.song-artist {
		margin: 0.125rem 0 0;
		font-size: 0.85rem;
	}
	.song-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.5rem;
	}
	.pending-badge {
		border-style: dashed;
		white-space: nowrap;
	}
	.song-side {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-muted);
	}
	.chord-count {
		font-size: 0.78rem;
		white-space: nowrap;
	}
	@media (min-width: 720px) {
		.filters {
			grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
			align-items: center;
		}
	}
	@media (max-width: 420px) {
		.chord-count {
			display: none;
		}
	}
</style>
