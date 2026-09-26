<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ChordLyrics from '$lib/components/ChordLyrics.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import SongForm from '$lib/components/SongForm.svelte';
	import { ClientApiError, jsonRequest } from '$lib/client/json';
	import {
		connection,
		discardPendingSong,
		pending,
		retryPendingSong
	} from '$lib/offline/sync.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let editing = $state(false);
	let confirmingDelete = $state(false);
	let deleting = $state(false);
	let error = $state<string | null>(null);

	const tagsById = $derived(new Map(data.tags.map((tag) => [tag.id, tag])));
	// Sin conexión, o si aún no se subió, la canción solo se puede ver.
	const readOnly = $derived(!connection.online || data.pending !== null);

	// Cuando la canción creada sin conexión se sube, esta URL (su id local) deja
	// de valer: se salta a la de verdad.
	$effect(() => {
		const realId = data.pending ? pending.synced[data.pending.clientId] : undefined;
		if (realId) goto(resolve('/canciones/[id]', { id: realId }), { replaceState: true });
	});

	function retry() {
		if (data.pending) void retryPendingSong(data.pending.clientId);
	}

	async function discard() {
		if (!data.pending) return;
		await discardPendingSong(data.pending.clientId);
		await goto(resolve('/canciones'));
	}

	const songTags = $derived(
		data.song.tagIds.map((id) => tagsById.get(id)).filter((tag) => tag !== undefined)
	);

	async function onSaved() {
		editing = false;
		await invalidateAll();
	}

	async function remove() {
		deleting = true;
		error = null;
		try {
			await jsonRequest(`/api/songs/${data.song.id}`, 'DELETE');
			await goto(resolve('/canciones'), { invalidateAll: true });
		} catch (requestError) {
			error =
				requestError instanceof ClientApiError
					? requestError.message
					: 'No se pudo eliminar la canción';
			deleting = false;
			confirmingDelete = false;
		}
	}
</script>

<svelte:head><title>{data.song.title} · OurSongs</title></svelte:head>

<a class="back" href={resolve('/canciones')}>
	<Icon name="back" size={16} /> Canciones
</a>

{#if editing}
	<PageHeader title="Editar canción" subtitle={data.song.title} />
	<SongForm song={data.song} tags={data.tags} {onSaved} onCancel={() => (editing = false)} />
{:else}
	<PageHeader title={data.song.title} subtitle={data.song.artist ?? ''}>
		{#snippet action()}
			{#if !readOnly}
				<a class="btn btn-ghost" href={resolve('/canciones/[id]/alinear', { id: data.song.id })}>
					<Icon name="lyrics" size={16} /> Alinear acordes
				</a>
				<button
					class="icon-btn"
					title="Editar"
					aria-label="Editar canción"
					onclick={() => (editing = true)}
				>
					<Icon name="pencil" size={18} />
				</button>
				<button
					class="icon-btn"
					title="Eliminar"
					aria-label="Eliminar canción"
					onclick={() => (confirmingDelete = true)}
				>
					<Icon name="trash" size={18} />
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.song.rhythm || songTags.length > 0}
		<div class="tags">
			{#if data.song.rhythm}
				<span class="badge" title="Ritmo">
					<Icon name="metronome" size={12} />
					{data.song.rhythm}
				</span>
			{/if}
			{#each songTags as tag (tag.id)}
				<span class="badge badge-strong"><Icon name="tag" size={12} /> {tag.name}</span>
			{/each}
		</div>
	{/if}

	{#if data.pending?.error}
		<div class="notice">
			<p>No se pudo subir: {data.pending.error}</p>
			<div class="notice-actions">
				<button class="btn btn-subtle" onclick={retry}>Reintentar</button>
				<button class="btn btn-danger" onclick={discard}>Descartar</button>
			</div>
		</div>
	{:else if data.pending}
		<p class="notice muted">
			Creada sin conexión. Se subirá sola cuando haya internet; hasta entonces no se puede editar.
		</p>
	{:else if !connection.online}
		<p class="notice muted">Sin conexión: la canción se puede ver, pero no editar.</p>
	{/if}

	{#if error}<p class="error-text">{error}</p>{/if}

	<ChordLyrics
		lyrics={data.song.lyrics}
		chords={data.song.chords}
		placements={data.song.chordPlacements}
		songId={data.song.id}
		onEdit={() => (editing = true)}
		{readOnly}
	/>

	{#if !data.pending}
		<p class="meta muted">
			Actualizada
			<time datetime={data.song.updatedAt}>{data.updatedAtLabel}</time>
		</p>
	{/if}
{/if}

<ConfirmDialog
	open={confirmingDelete}
	title="¿Eliminar la canción?"
	message={`"${data.song.title}" se borra para todos y no se puede recuperar.`}
	busy={deleting}
	onConfirm={remove}
	onCancel={() => (confirmingDelete = false)}
/>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 1rem;
		color: var(--color-muted);
		font-size: 0.82rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-decoration: none;
		text-transform: uppercase;
	}
	@media (hover: hover) {
		.back:hover {
			color: var(--color-text);
		}
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: -1rem;
		margin-bottom: 1rem;
	}
	.notice {
		margin: 0 0 1rem;
		padding: 0.75rem 1rem;
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-control);
		font-size: 0.85rem;
	}
	.notice p {
		margin: 0;
	}
	.notice-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.meta {
		margin: 2.5rem 0 0;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border-soft);
		font-size: 0.78rem;
	}
</style>
