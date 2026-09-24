<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { ClientApiError, jsonRequest } from '$lib/client/json';
	import { TAG_NAME_MAX_LENGTH } from '$lib/validation';
	import type { TagWithCount } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let creating = $state(false);
	let newName = $state('');
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	/** Tag cuyas canciones se están asignando. */
	let assigningId = $state<string | null>(null);
	let selectedSongIds = $state<string[]>([]);
	let songFilter = $state('');
	let deletingTag = $state<TagWithCount | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const visibleSongs = $derived.by(() => {
		const needle = songFilter.trim().toLowerCase();
		if (!needle) return data.songs;
		return data.songs.filter((song) =>
			`${song.title} ${song.artist ?? ''}`.toLowerCase().includes(needle)
		);
	});

	function reset() {
		creating = false;
		newName = '';
		renamingId = null;
		renameValue = '';
		assigningId = null;
		songFilter = '';
		error = null;
	}

	async function run(action: () => Promise<unknown>) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			await action();
			await invalidateAll();
			reset();
		} catch (requestError) {
			error =
				requestError instanceof ClientApiError
					? requestError.message
					: 'No se pudo completar la operación';
		} finally {
			busy = false;
		}
	}

	function startRename(tag: TagWithCount) {
		reset();
		renamingId = tag.id;
		renameValue = tag.name;
	}

	function startAssign(tag: TagWithCount) {
		const wasOpen = assigningId === tag.id;
		reset();
		if (wasOpen) return;
		assigningId = tag.id;
		selectedSongIds = data.songs.filter((song) => song.tagIds.includes(tag.id)).map((s) => s.id);
	}

	function toggleSong(id: string) {
		selectedSongIds = selectedSongIds.includes(id)
			? selectedSongIds.filter((value) => value !== id)
			: [...selectedSongIds, id];
	}
</script>

<svelte:head><title>Tags · OurSongs</title></svelte:head>

<PageHeader
	title="Tags"
	subtitle="Etiqueta las canciones para encontrarlas luego por estilo, ocasión o quien las canta."
>
	{#snippet action()}
		<button
			class="btn btn-primary"
			onclick={() => {
				const wasOpen = creating;
				reset();
				creating = !wasOpen;
			}}
		>
			<Icon name="plus" size={16} /> Nuevo
		</button>
	{/snippet}
</PageHeader>

{#if creating}
	<form
		class="card create"
		onsubmit={(event) => {
			event.preventDefault();
			run(() => jsonRequest('/api/tags', 'POST', { name: newName }));
		}}
	>
		<div class="create-field">
			<label class="label" for="new-tag">Nombre del tag</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="new-tag"
				class="input"
				bind:value={newName}
				maxlength={TAG_NAME_MAX_LENGTH}
				placeholder="Alabanza, Navidad, Acústico…"
				autofocus
				required
			/>
		</div>
		<div class="create-actions">
			<button type="button" class="btn btn-subtle" disabled={busy} onclick={reset}>Cancelar</button>
			<button type="submit" class="btn btn-primary" disabled={busy}>
				{#if busy}Creando…{:else}Crear{/if}
			</button>
		</div>
	</form>
{/if}

{#if error}<p class="error-text">{error}</p>{/if}

{#if data.tags.length === 0}
	<EmptyState
		icon="tag"
		title="Todavía no hay tags"
		message="Crea el primero y asígnalo a las canciones que quieras."
	>
		<button
			class="btn btn-primary"
			onclick={() => {
				reset();
				creating = true;
			}}
		>
			<Icon name="plus" size={16} /> Nuevo tag
		</button>
	</EmptyState>
{:else}
	<ul class="tag-list">
		{#each data.tags as tag (tag.id)}
			<li class="card tag-card">
				<div class="tag-row">
					{#if renamingId === tag.id}
						<form
							class="rename"
							onsubmit={(event) => {
								event.preventDefault();
								run(() => jsonRequest(`/api/tags/${tag.id}`, 'PATCH', { name: renameValue }));
							}}
						>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class="input"
								bind:value={renameValue}
								maxlength={TAG_NAME_MAX_LENGTH}
								aria-label="Nuevo nombre del tag"
								autofocus
								required
							/>
							<button type="submit" class="btn btn-primary btn-small" disabled={busy}>
								<Icon name="check" size={15} /> Guardar
							</button>
							<button
								type="button"
								class="btn btn-subtle btn-small"
								disabled={busy}
								onclick={reset}
							>
								Cancelar
							</button>
						</form>
					{:else}
						<div class="tag-name">
							<Icon name="tag" size={16} />
							<strong>{tag.name}</strong>
							<span class="badge">
								{tag.songCount}
								{tag.songCount === 1 ? 'canción' : 'canciones'}
							</span>
						</div>

						<div class="tag-actions">
							<button
								class="btn btn-ghost btn-small"
								aria-expanded={assigningId === tag.id}
								onclick={() => startAssign(tag)}
							>
								<Icon name="music" size={15} /> Canciones
							</button>
							<button
								class="icon-btn"
								title="Renombrar"
								aria-label="Renombrar tag"
								onclick={() => startRename(tag)}
							>
								<Icon name="pencil" size={17} />
							</button>
							<button
								class="icon-btn"
								title="Eliminar"
								aria-label="Eliminar tag"
								onclick={() => {
									reset();
									deletingTag = tag;
								}}
							>
								<Icon name="trash" size={17} />
							</button>
						</div>
					{/if}
				</div>

				{#if assigningId === tag.id}
					<div class="assign">
						{#if data.songs.length === 0}
							<p class="hint">
								No hay canciones registradas todavía. Añade alguna en
								<a href={resolve('/canciones')}>Canciones</a>.
							</p>
						{:else}
							<input
								class="input"
								type="search"
								bind:value={songFilter}
								placeholder="Filtrar canciones"
								aria-label="Filtrar canciones"
							/>

							<ul class="song-picker">
								{#each visibleSongs as song (song.id)}
									<li>
										<label class="song-option">
											<input
												type="checkbox"
												checked={selectedSongIds.includes(song.id)}
												onchange={() => toggleSong(song.id)}
											/>
											<span class="song-option-text">
												{song.title}
												{#if song.artist}<span class="muted"> · {song.artist}</span>{/if}
											</span>
										</label>
									</li>
								{:else}
									<li class="hint">Ninguna canción coincide con el filtro.</li>
								{/each}
							</ul>

							<div class="assign-actions">
								<span class="muted count">
									{selectedSongIds.length}
									{selectedSongIds.length === 1 ? 'seleccionada' : 'seleccionadas'}
								</span>
								<button type="button" class="btn btn-subtle" disabled={busy} onclick={reset}>
									Cancelar
								</button>
								<button
									type="button"
									class="btn btn-primary"
									disabled={busy}
									onclick={() =>
										run(() =>
											jsonRequest(`/api/tags/${tag.id}/songs`, 'PUT', {
												songIds: selectedSongIds
											})
										)}
								>
									{#if busy}Guardando…{:else}<Icon name="check" size={16} /> Guardar{/if}
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<ConfirmDialog
	open={deletingTag !== null}
	title="¿Eliminar el tag?"
	message={deletingTag
		? `"${deletingTag.name}" se quita de ${deletingTag.songCount === 1 ? 'la canción que lo lleva' : `las ${deletingTag.songCount} canciones que lo llevan`}. Las canciones no se borran.`
		: ''}
	{busy}
	onConfirm={() => {
		const tag = deletingTag;
		if (!tag) return;
		run(async () => {
			try {
				await jsonRequest(`/api/tags/${tag.id}`, 'DELETE');
			} finally {
				// También al fallar: si no, el error queda tapado por el diálogo.
				deletingTag = null;
			}
		});
	}}
	onCancel={() => (deletingTag = null)}
/>

<style>
	.create {
		display: grid;
		gap: 1rem;
		margin-bottom: 1.25rem;
		padding: 1rem;
	}
	.create-field {
		min-width: 0;
	}
	.create-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.tag-list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tag-card {
		padding: 0.875rem 1rem;
	}
	.tag-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 2.75rem;
	}
	.tag-name {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-subtle);
	}
	.tag-name strong {
		color: var(--color-text);
		font-size: 1rem;
		overflow-wrap: break-word;
	}
	.tag-actions {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.25rem;
	}
	.rename {
		display: flex;
		width: 100%;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.rename .input {
		width: auto;
		min-width: 12rem;
		flex: 1 1 12rem;
	}
	.assign {
		display: grid;
		gap: 0.75rem;
		margin-top: 0.875rem;
		padding-top: 0.875rem;
		border-top: 1px solid var(--color-border);
	}
	.song-picker {
		display: grid;
		max-height: 18rem;
		gap: 0.125rem;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
	}
	.song-option {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem;
		border-radius: var(--radius-control);
		cursor: pointer;
	}
	@media (hover: hover) {
		.song-option:hover {
			background: var(--color-surface-2);
		}
	}
	.song-option input {
		width: 1.1rem;
		height: 1.1rem;
		flex: 0 0 auto;
		border-color: var(--color-border-strong);
		background: var(--color-surface-2);
		color: var(--color-text);
	}
	.song-option input:checked {
		background: var(--color-text);
	}
	.song-option-text {
		min-width: 0;
		font-size: 0.9rem;
		overflow-wrap: break-word;
	}
	.assign-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.count {
		margin-right: auto;
		font-size: 0.8rem;
	}
	a {
		color: var(--color-text);
	}
	@media (max-width: 560px) {
		.tag-row {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.625rem;
		}
		.tag-actions {
			width: 100%;
			justify-content: space-between;
		}
	}
</style>
