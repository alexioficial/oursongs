<script lang="ts">
	import type { SongTab } from '$lib/types';

	interface Props {
		tab: SongTab;
		startColumn: number;
		columnCount?: number;
		printable: boolean;
	}

	const PAGE_SIZE = 12;
	const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

	let { tab, startColumn, columnCount = 1, printable }: Props = $props();
	let pageStartColumn = $state(0);
	let requestedColumn = $state('1');
	const visibleStartColumn = $derived(printable ? startColumn : pageStartColumn);
	const visibleColumnCount = $derived(
		printable ? Math.max(1, columnCount) : Math.min(PAGE_SIZE, MAX_COLUMN - visibleStartColumn + 1)
	);
	const columns = $derived(Array.from({ length: visibleColumnCount }, (_, index) => index));
	const visibleNotes = $derived(
		tab.notes.filter(
			(note) =>
				note.column >= visibleStartColumn && note.column < visibleStartColumn + visibleColumnCount
		)
	);
	const pageEndColumn = $derived(visibleStartColumn + visibleColumnCount - 1);
	const notesByCell = $derived.by(() =>
		Object.fromEntries(
			visibleNotes.map((note) => [`${note.string}:${note.column - visibleStartColumn}`, note])
		)
	);

	function movePage(direction: -1 | 1) {
		pageStartColumn = Math.max(0, Math.min(MAX_COLUMN, pageStartColumn + direction * PAGE_SIZE));
		requestedColumn = String(pageStartColumn + 1);
	}

	function goToColumn(event: SubmitEvent) {
		event.preventDefault();
		const columnNumber = Number(requestedColumn);
		if (!Number.isInteger(columnNumber) || columnNumber < 1 || columnNumber > MAX_COLUMN + 1) {
			return;
		}
		pageStartColumn = Math.floor((columnNumber - 1) / PAGE_SIZE) * PAGE_SIZE;
	}
</script>

<section
	class="tab-view"
	class:printable
	aria-label={`Tablatura ${tab.name}${startColumn > 0 ? ', continuación' : ''}`}
	style:--columns={visibleColumnCount}
	style:--column-size={printable ? '3ch' : '2.75rem'}
	style:--tab-foreground={printable ? 'var(--lyrics-color)' : 'var(--color-text)'}
	style:--tab-line={printable ? 'var(--lyrics-color)' : 'var(--color-border-strong)'}
	style:--tab-surface={printable ? 'transparent' : 'var(--color-surface)'}
>
	<h3 class="tab-title">
		{tab.name}{#if startColumn > 0}<span class="continuation"> · continuación</span>{/if}
	</h3>
	{#if !printable}
		<div class="page-navigation" role="group" aria-label="Navegación de columnas">
			<button
				type="button"
				class="btn btn-ghost"
				disabled={pageStartColumn === 0}
				onclick={() => movePage(-1)}
			>
				Anterior
			</button>
			<span aria-live="polite">Columnas {visibleStartColumn + 1}–{pageEndColumn + 1}</span>
			<button
				type="button"
				class="btn btn-ghost"
				disabled={pageStartColumn + PAGE_SIZE > MAX_COLUMN}
				onclick={() => movePage(1)}
			>
				Siguiente
			</button>
			<form onsubmit={goToColumn}>
				<label for={`tab-view-jump-${tab.id}`}>Ir a columna</label>
				<input
					id={`tab-view-jump-${tab.id}`}
					class="input"
					type="number"
					min="1"
					step="1"
					bind:value={requestedColumn}
				/>
				<button type="submit" class="btn btn-subtle">Ir</button>
			</form>
		</div>
	{:else}
		<p class="column-range">Columnas {visibleStartColumn + 1}–{pageEndColumn + 1}</p>
	{/if}
	{#if visibleNotes.length > 0}
		<ul class="visually-hidden">
			{#each [0, 1, 2, 3, 4, 5] as string (string)}
				{@const lineNotes = visibleNotes.filter((note) => note.string === string)}
				<li>
					Cuerda {string + 1}:
					{#if lineNotes.length > 0}
						{lineNotes
							.map(({ column, fret }) => `columna ${column + 1}, traste ${fret}`)
							.join('; ')}
					{:else}
						sin notas
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="visually-hidden">La tablatura todavía no tiene notas.</p>
	{/if}
	<div class="line-scroll" aria-hidden="true">
		<div class="staff">
			{#each [0, 1, 2, 3, 4, 5] as string (string)}
				<div class="string-line">
					{#each columns as column (column)}
						{@const note = notesByCell[`${string}:${column}`]}
						<span class="tab-cell">
							{#if note}<span class="fret">{note.fret}</span>{/if}
						</span>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.tab-view {
		min-width: 0;
		padding: 0.875rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-surface);
		color: var(--color-text);
		break-inside: avoid;
	}
	.tab-view.printable {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--lyrics-color);
	}
	.tab-title {
		margin: 0 0 0.75rem;
		color: var(--tab-foreground, var(--color-text));
		font-family: var(--font-sans);
		font-size: 0.9rem;
		font-weight: 650;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.page-navigation {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
		color: var(--color-subtle);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	.page-navigation form {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-left: auto;
	}
	.page-navigation label {
		color: var(--color-subtle);
		font-size: 0.8rem;
	}
	.page-navigation input {
		width: 6rem;
	}
	.column-range {
		margin: 0 0 0.5rem;
		color: var(--tab-foreground, var(--color-subtle));
		font-size: 0.75em;
		font-variant-numeric: tabular-nums;
	}
	.continuation {
		font-weight: 400;
	}
	.line-scroll {
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-color: var(--color-border) transparent;
	}
	.staff {
		width: max-content;
		min-width: 100%;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.string-line {
		display: grid;
		grid-template-columns: repeat(var(--columns), var(--column-size));
		min-height: 1.75rem;
	}
	.tab-cell {
		position: relative;
		display: grid;
		place-items: center;
		min-width: 0;
		border-bottom: 1px solid var(--tab-line, var(--color-border-strong));
	}
	.fret {
		min-width: 1.4em;
		padding: 0 0.12em;
		background: var(--tab-surface, var(--color-surface));
		color: var(--tab-foreground, var(--color-text));
		font-size: 0.85rem;
		font-weight: 650;
		line-height: 1.2;
		text-align: center;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.tab-view.printable .tab-title {
		margin-bottom: 0.5em;
		font-size: 0.85em;
	}
	.tab-view.printable .string-line {
		min-height: 1.45em;
	}
	.tab-view.printable .fret {
		font-size: 0.8em;
	}
	@media print {
		.line-scroll {
			overflow: visible;
		}
	}
</style>
