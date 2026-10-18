<script lang="ts">
	import type { SongTab } from '$lib/types';

	interface Props {
		tab: SongTab;
		startColumn: number;
		columnCount: number;
		printable: boolean;
	}

	let { tab, startColumn, columnCount, printable }: Props = $props();
	const columns = $derived(Array.from({ length: Math.max(1, columnCount) }, (_, index) => index));
	const visibleNotes = $derived(
		tab.notes.filter(
			(note) => note.column >= startColumn && note.column < startColumn + columnCount
		)
	);
	const notesByCell = $derived.by(() =>
		Object.fromEntries(
			visibleNotes.map((note) => [`${note.string}:${note.column - startColumn}`, note])
		)
	);
</script>

<section
	class="tab-view"
	class:printable
	aria-label={`Tablatura ${tab.name}${startColumn > 0 ? ', continuación' : ''}`}
	style:--columns={Math.max(1, columnCount)}
	style:--column-size={printable ? '3ch' : '2.75rem'}
	style:--tab-foreground={printable ? 'var(--lyrics-color)' : 'var(--color-text)'}
	style:--tab-line={printable ? 'var(--lyrics-color)' : 'var(--color-border-strong)'}
	style:--tab-surface={printable ? 'transparent' : 'var(--color-surface)'}
>
	<h3 class="tab-title">
		{tab.name}{#if startColumn > 0}<span class="continuation"> · continuación</span>{/if}
	</h3>
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
	@media print {
		.tab-title {
			margin-bottom: 0.5em;
			font-size: 0.85em;
		}
		.line-scroll {
			overflow: visible;
		}
		.string-line {
			min-height: 1.45em;
		}
		.fret {
			font-size: 0.8em;
		}
	}
</style>
