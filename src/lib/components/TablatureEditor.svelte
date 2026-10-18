<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { createId } from '$lib/client/ids';
	import { nextTabName, removeTabNote, setTabNote } from '$lib/music/tablature';
	import type { SongTab, TabNote } from '$lib/types';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		tabs: SongTab[];
		disabled?: boolean;
	}

	interface PendingEntry {
		tabId: string;
		string: number;
		column: number;
		digit: string;
	}

	const VISIBLE_COLUMNS = 24;

	let { tabs = $bindable(), disabled = false }: Props = $props();
	let selectedTabId = $state<string | null>(null);
	let selectedString = $state(0);
	let selectedColumn = $state(0);
	let windowStartColumn = $state(0);
	let jumpColumn = $state('1');
	let pendingEntry = $state<PendingEntry | null>(null);
	let confirmingDelete = $state(false);
	let gridElement = $state<HTMLDivElement>();
	let entryTimer: ReturnType<typeof setTimeout> | undefined;
	let entryGeneration = 0;

	const activeTab = $derived(tabs.find(({ id }) => id === selectedTabId) ?? tabs[0] ?? null);
	const columns = $derived(
		Array.from(
			{
				length: Math.min(VISIBLE_COLUMNS, Number.MAX_SAFE_INTEGER - windowStartColumn + 1)
			},
			(_, index) => windowStartColumn + index
		)
	);
	const notesByCell = $derived.by(() =>
		Object.fromEntries(
			activeTab?.notes.map((note) => [`${note.string}:${note.column}`, note]) ?? []
		)
	);

	function clearEntryTimer() {
		if (entryTimer !== undefined) clearTimeout(entryTimer);
		entryTimer = undefined;
		entryGeneration++;
	}

	function updateTab(tabId: string, update: (tab: SongTab) => SongTab) {
		tabs = tabs.map((tab) => (tab.id === tabId ? update(tab) : tab));
	}

	function commitEntry(entry: PendingEntry, advance: boolean, focusGrid = true) {
		updateTab(entry.tabId, (tab) =>
			setTabNote(tab, { string: entry.string, column: entry.column, fret: Number(entry.digit) })
		);
		if (advance && activeTab?.id === entry.tabId) {
			selectedString = entry.string;
			selectedColumn = Math.min(Number.MAX_SAFE_INTEGER, entry.column + 1);
			void keepSelectionVisible(focusGrid);
		}
	}

	function confirmPending(advance: boolean, focusGrid = true) {
		const entry = pendingEntry;
		if (!entry) return;
		clearEntryTimer();
		pendingEntry = null;
		commitEntry(entry, advance, focusGrid);
	}

	function scheduleEntry(entry: PendingEntry) {
		pendingEntry = entry;
		clearEntryTimer();
		const generation = entryGeneration;
		entryTimer = setTimeout(() => {
			if (generation === entryGeneration && pendingEntry) {
				const mobileInputFocused =
					document.activeElement instanceof HTMLInputElement &&
					document.activeElement.classList.contains('fret-input');
				confirmPending(true, !mobileInputFocused);
			}
		}, 500);
	}

	function enterDigit(digit: string) {
		if (!activeTab || disabled) return;
		if (pendingEntry) {
			const previous = pendingEntry;
			if (
				previous.tabId === activeTab.id &&
				previous.string === selectedString &&
				previous.column === selectedColumn
			) {
				clearEntryTimer();
				pendingEntry = null;
				commitEntry({ ...previous, digit: `${previous.digit}${digit}` }, true);
				return;
			}
			confirmPending(false);
		}
		scheduleEntry({
			tabId: activeTab.id,
			string: selectedString,
			column: selectedColumn,
			digit
		});
	}

	async function keepSelectionVisible(focusGrid = true) {
		windowStartColumn = Math.floor(selectedColumn / VISIBLE_COLUMNS) * VISIBLE_COLUMNS;
		await tick();
		if (focusGrid) gridElement?.focus({ preventScroll: true });
		gridElement?.querySelector<HTMLButtonElement>('.cell.selected')?.scrollIntoView({
			block: 'nearest',
			inline: 'nearest'
		});
	}

	function selectCell(string: number, column: number) {
		confirmPending(false);
		const isTrailingCell =
			column === windowStartColumn + columns.length - 1 && !notesByCell[`${string}:${column}`];
		selectedString = string;
		selectedColumn = isTrailingCell ? Math.min(Number.MAX_SAFE_INTEGER, column + 1) : column;
		void keepSelectionVisible();
	}

	function moveWindow(direction: -1 | 1) {
		const nextColumn = Math.max(
			0,
			Math.min(Number.MAX_SAFE_INTEGER, windowStartColumn + direction * VISIBLE_COLUMNS)
		);
		selectedColumn = nextColumn;
		jumpColumn = String(nextColumn + 1);
		void keepSelectionVisible();
	}

	function goToColumn(event: SubmitEvent) {
		event.preventDefault();
		const requestedColumn = Number(jumpColumn);
		if (
			!Number.isInteger(requestedColumn) ||
			requestedColumn < 1 ||
			requestedColumn > Number.MAX_SAFE_INTEGER + 1
		) {
			return;
		}
		selectedColumn = requestedColumn - 1;
		void keepSelectionVisible();
	}

	function enterMobileFret(value: string, input: HTMLInputElement) {
		const digit = value.replace(/[^0-9]/g, '').slice(0, 2);
		if (input.value !== digit) input.value = digit;
		if (digit.length === 0) {
			clearEntryTimer();
			pendingEntry = null;
			return;
		}
		if (digit.length === 1) {
			enterDigit(digit);
			return;
		}

		const entry = {
			tabId: activeTab?.id ?? '',
			string: selectedString,
			column: selectedColumn,
			digit
		};
		if (
			pendingEntry?.tabId === entry.tabId &&
			pendingEntry.string === entry.string &&
			pendingEntry.column === entry.column
		) {
			clearEntryTimer();
			pendingEntry = null;
		} else {
			confirmPending(false, false);
		}
		if (activeTab && !disabled) commitEntry(entry, true, false);
	}

	function deleteSelectedNote() {
		if (!activeTab || disabled) return;
		clearEntryTimer();
		pendingEntry = null;
		updateTab(activeTab.id, (tab) => removeTabNote(tab, selectedString, selectedColumn));
	}

	function handleGridKeydown(event: KeyboardEvent) {
		if (disabled) return;
		if (/^[0-9]$/.test(event.key)) {
			event.preventDefault();
			enterDigit(event.key);
			return;
		}

		if (event.key === 'Backspace' || event.key === 'Delete') {
			event.preventDefault();
			deleteSelectedNote();
			return;
		}

		const movements: Record<string, () => void> = {
			ArrowLeft: () => (selectedColumn = Math.max(0, selectedColumn - 1)),
			ArrowRight: () => (selectedColumn = Math.min(Number.MAX_SAFE_INTEGER, selectedColumn + 1)),
			ArrowUp: () => (selectedString = Math.max(0, selectedString - 1)),
			ArrowDown: () => (selectedString = Math.min(5, selectedString + 1))
		};
		const move = movements[event.key];
		if (!move) return;
		event.preventDefault();
		confirmPending(false);
		move();
		void keepSelectionVisible();
	}

	function addTab() {
		if (disabled) return;
		confirmPending(false);
		const id = createId();
		tabs = [...tabs, { id, name: nextTabName(tabs), notes: [] }];
		selectedTabId = id;
		selectedString = 0;
		selectedColumn = 0;
		windowStartColumn = 0;
		jumpColumn = '1';
	}

	function selectTab(tabId: string) {
		confirmPending(false);
		selectedTabId = tabId;
		selectedString = 0;
		selectedColumn = 0;
		windowStartColumn = 0;
		jumpColumn = '1';
		void tick().then(() => gridElement?.focus({ preventScroll: true }));
	}

	function renameTab(tabId: string, name: string) {
		updateTab(tabId, (tab) => ({ ...tab, name }));
	}

	function deleteTab() {
		if (!activeTab || disabled) return;
		confirmPending(false);
		const remaining = tabs.filter(({ id }) => id !== activeTab.id);
		tabs = remaining;
		selectedTabId = remaining[0]?.id ?? null;
		selectedString = 0;
		selectedColumn = 0;
		windowStartColumn = 0;
		jumpColumn = '1';
		confirmingDelete = false;
	}

	onDestroy(clearEntryTimer);
</script>

<section class="editor" aria-label="Editor de tablaturas">
	<div class="toolbar">
		{#if tabs.length > 0}
			<div class="tab-list" role="tablist" aria-label="Tablaturas de la canción">
				{#each tabs as tab (tab.id)}
					<button
						type="button"
						id={`song-tab-${tab.id}`}
						class="tab-choice"
						role="tab"
						aria-selected={activeTab?.id === tab.id}
						aria-controls="song-tab-panel"
						{disabled}
						onclick={() => selectTab(tab.id)}
					>
						<span>{tab.name.trim() || 'Sin nombre'}</span>
					</button>
				{/each}
			</div>
		{/if}
		<button type="button" class="btn btn-ghost" {disabled} onclick={addTab}>
			<Icon name="plus" size={15} /> Añadir tablatura
		</button>
	</div>

	{#if activeTab}
		<div class="tab-settings">
			<label class="tab-name">
				<span class="label">Nombre de la tablatura</span>
				<input
					class="input"
					value={activeTab.name}
					{disabled}
					aria-label="Nombre de la tablatura"
					oninput={(event) => renameTab(activeTab.id, event.currentTarget.value)}
				/>
			</label>
			<button
				type="button"
				class="btn btn-danger"
				{disabled}
				onclick={() => (confirmingDelete = true)}
			>
				<Icon name="trash" size={15} /> Quitar tablatura
			</button>
		</div>

		<p class="hint instructions">
			Elige una celda y escribe el traste. Las flechas mueven la selección; Suprimir borra una nota.
		</p>
		<div class="column-navigation" role="group" aria-label="Navegación de columnas">
			<button
				type="button"
				class="btn btn-ghost"
				disabled={disabled || windowStartColumn === 0}
				onclick={() => moveWindow(-1)}
			>
				Anterior
			</button>
			<span class="column-range" aria-live="polite">
				Columnas {windowStartColumn + 1}–{windowStartColumn + columns.length}
			</span>
			<button
				type="button"
				class="btn btn-ghost"
				disabled={disabled || windowStartColumn + VISIBLE_COLUMNS > Number.MAX_SAFE_INTEGER}
				onclick={() => moveWindow(1)}
			>
				Siguiente
			</button>
			<form class="jump-form" onsubmit={goToColumn}>
				<label for="tab-column-jump">Ir a columna</label>
				<input
					id="tab-column-jump"
					class="input"
					type="number"
					min="1"
					step="1"
					bind:value={jumpColumn}
					{disabled}
				/>
				<button type="submit" class="btn btn-subtle" {disabled}>Ir</button>
			</form>
		</div>
		<div class="grid-scroll">
			<div
				id="song-tab-panel"
				class="tab-grid"
				role="grid"
				aria-label={`Editor de ${activeTab.name || 'tablatura'}`}
				aria-rowcount="7"
				aria-colcount={-1}
				aria-labelledby={`song-tab-${activeTab.id}`}
				aria-activedescendant={`tab-cell-${activeTab.id}-${selectedString}-${selectedColumn}`}
				tabindex="0"
				bind:this={gridElement}
				onkeydown={handleGridKeydown}
				onfocusout={(event) => {
					const target = event.relatedTarget;
					if (!(target instanceof HTMLInputElement && target.classList.contains('fret-input'))) {
						confirmPending(false, false);
					}
				}}
			>
				<div
					class="grid-row column-headings"
					role="row"
					aria-label="Columnas"
					style={`--columns: ${columns.length}`}
				>
					<span class="row-heading" role="columnheader">Cuerda</span>
					{#each columns as column (column)}
						<span class="column-number" role="columnheader">{column + 1}</span>
					{/each}
				</div>
				{#each [0, 1, 2, 3, 4, 5] as string (string)}
					<div
						class="grid-row"
						role="row"
						aria-label={`Cuerda ${string + 1}`}
						style={`--columns: ${columns.length}`}
					>
						<span class="string-number" aria-hidden="true">{string + 1}</span>
						{#each columns as column (column)}
							{@const note = notesByCell[`${string}:${column}`] as TabNote | undefined}
							<button
								type="button"
								class="cell"
								class:selected={selectedString === string && selectedColumn === column}
								id={`tab-cell-${activeTab.id}-${string}-${column}`}
								role="gridcell"
								aria-selected={selectedString === string && selectedColumn === column}
								aria-colindex={column + 2}
								aria-label={`Cuerda ${string + 1}, columna ${column + 1}, ${note ? `traste ${note.fret}` : 'vacía'}`}
								tabindex="-1"
								{disabled}
								onclick={() => selectCell(string, column)}
							>
								{#if note}{note.fret}{:else}&nbsp;{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		</div>
		<div class="fret-entry">
			<label class="label" for={`tab-fret-entry-${activeTab.id}`}>
				Traste · cuerda {selectedString + 1}, columna {selectedColumn + 1}
			</label>
			<input
				id={`tab-fret-entry-${activeTab.id}`}
				class="input fret-input"
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				maxlength="2"
				value={pendingEntry?.digit ?? ''}
				{disabled}
				oninput={(event) => enterMobileFret(event.currentTarget.value, event.currentTarget)}
			/>
			<button
				type="button"
				class="btn btn-danger"
				disabled={disabled || !notesByCell[`${selectedString}:${selectedColumn}`]}
				onclick={deleteSelectedNote}
			>
				Borrar nota
			</button>
		</div>
		{#if pendingEntry}
			<p class="pending-note" aria-live="polite">Traste {pendingEntry.digit}…</p>
		{/if}
	{:else}
		<p class="empty">Añade una tablatura para empezar a colocar notas.</p>
	{/if}
</section>

<ConfirmDialog
	open={confirmingDelete}
	title="¿Quitar esta tablatura?"
	message={`Se eliminarán “${activeTab?.name ?? ''}” y todas sus notas.`}
	confirmLabel="Quitar"
	onConfirm={deleteTab}
	onCancel={() => (confirmingDelete = false)}
/>

<style>
	.editor {
		display: grid;
		gap: 0.875rem;
		min-width: 0;
	}
	.toolbar,
	.tab-settings {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.tab-list {
		display: flex;
		gap: 0.375rem;
		max-width: 100%;
		overflow-x: auto;
		padding: 2px;
	}
	.tab-choice {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-surface-2);
		color: var(--color-subtle);
		font: inherit;
		font-size: 0.85rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.tab-choice[aria-selected='true'] {
		border-color: var(--color-border-strong);
		background: var(--color-elevated);
		color: var(--color-text);
	}
	.tab-name {
		flex: 1 1 14rem;
		min-width: min(100%, 14rem);
	}
	.instructions {
		margin-top: 0;
	}
	.grid-scroll {
		max-width: 100%;
		overflow: auto;
		padding: 0.25rem 0.125rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-surface);
		scrollbar-color: var(--color-border) transparent;
	}
	.column-navigation {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.column-range {
		color: var(--color-subtle);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	.jump-form {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-left: auto;
	}
	.jump-form label {
		color: var(--color-subtle);
		font-size: 0.8rem;
	}
	.jump-form input {
		width: 6rem;
	}
	.fret-entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(5rem, 8rem) auto;
		align-items: center;
		gap: 0.75rem;
	}
	.fret-entry .label {
		margin: 0;
	}
	.tab-grid {
		width: max-content;
		outline: none;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.grid-row {
		display: grid;
		grid-template-columns: 2.5rem repeat(var(--columns), 2.75rem);
		gap: 0;
		min-height: 2.75rem;
	}
	.column-headings {
		color: var(--color-muted);
		font-size: 0.68rem;
		text-align: center;
	}
	.row-heading,
	.string-number,
	.column-number {
		display: grid;
		place-items: center;
	}
	.string-number {
		color: var(--color-subtle);
		font-size: 0.75rem;
	}
	.cell {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.75rem;
		min-height: 2.75rem;
		padding: 0;
		border: 0;
		border-bottom: 1px solid var(--color-border-strong);
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
	}
	.cell.selected {
		border-bottom: 2px solid var(--color-bright);
		background: var(--color-elevated);
		color: var(--color-bright);
	}
	.cell:focus-visible {
		z-index: 1;
		outline: 2px solid var(--color-bright);
		outline-offset: -2px;
	}
	.pending-note {
		margin: 0;
		color: var(--color-subtle);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.empty {
		margin: 0;
		padding: 1rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-control);
		color: var(--color-muted);
		font-size: 0.875rem;
	}
	@media (max-width: 520px) {
		.toolbar,
		.tab-settings {
			align-items: stretch;
			flex-direction: column;
		}
		.toolbar > .btn,
		.tab-settings > .btn {
			width: 100%;
		}
		.fret-entry {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.fret-entry .label {
			grid-column: 1 / -1;
		}
		.column-navigation > button {
			flex: 1;
		}
		.jump-form {
			width: 100%;
			margin-left: 0;
		}
		.jump-form input {
			flex: 1;
		}
	}
</style>
