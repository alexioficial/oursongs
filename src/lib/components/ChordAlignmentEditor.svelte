<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import { ClientApiError, jsonRequest } from '$lib/client/json';
	import {
		dropPlacement,
		movePlacement,
		offsetAtColumn,
		packChordRows,
		placementOffsets,
		placementsForLine,
		splitGraphemes,
		splitLyricLines,
		upsertPlacement
	} from '$lib/music/chordPlacements';
	import type { Song } from '$lib/types';

	interface Props {
		song: Song;
		onSaved: (song: Song) => void;
		onCancel: () => void;
	}

	interface DragState {
		pointerId: number;
		pointerType: string;
		chordId: string;
		label: string;
		/** Offset de origen si se está moviendo un acorde ya colocado; null si viene de la paleta. */
		from: number | null;
		x: number;
		y: number;
		/** Donde caería al soltar; null fuera de la letra (soltar ahí cancela). */
		target: number | null;
	}

	type PendingGesture = Omit<DragState, 'target'> & {
		startX: number;
		startY: number;
		timer?: ReturnType<typeof setTimeout>;
	};

	/**
	 * En táctil el arrastre empieza tras mantener pulsado: así deslizar el dedo
	 * sobre un acorde sigue haciendo scroll en vez de moverlo sin querer.
	 */
	const LONG_PRESS_MS = 220;
	const TOUCH_SLOP_PX = 8;
	const MOUSE_THRESHOLD_PX = 4;
	/** En la columna lateral, un acorde más largo que esto ocupa las dos columnas. */
	const WIDE_CHORD_LENGTH = 5;
	const AUTOSCROLL_EDGE_PX = 72;
	const AUTOSCROLL_MAX_SPEED = 18;

	let { song, onSaved, onCancel }: Props = $props();
	let placements = $state(
		untrack(() => song.chordPlacements.map((placement) => ({ ...placement })))
	);
	let selectedOffset = $state(0);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let drag = $state<DragState | null>(null);
	let editorEl = $state<HTMLElement>();
	let paletteEl = $state<HTMLElement>();

	// Estado del gesto que la vista no pinta: no necesita ser reactivo.
	let pending: PendingGesture | null = null;
	let suppressClick = false;
	let enteredEditor = false;
	let frame = 0;

	const chordById = $derived(new SvelteMap(song.chords.map((chord) => [chord.id, chord.value])));
	const lines = $derived(splitLyricLines(song.lyrics));
	const validOffsets = $derived(placementOffsets(song.lyrics));
	const selectedPlacement = $derived(
		placements.find((placement) => placement.offset === selectedOffset)
	);
	// La letra se pinta con el resultado de soltar ya aplicado: el "fantasma" es
	// el acorde en su sitio definitivo, con las filas ya reacomodadas.
	const preview = $derived(
		drag && drag.target !== null
			? dropPlacement(placements, drag.chordId, drag.from, drag.target)
			: placements
	);
	// La letra no puede cambiar de alto bajo el puntero mientras se arrastra, o el
	// destino salta de línea. Por eso cada línea tiene siempre al menos una fila de
	// acordes (colocar el primero no la hace crecer) y, durante el arrastre,
	// conserva las que tenía al empezar (sacar su acorde no la encoge).
	const reservedRows = $derived(
		lines.map((line) =>
			drag ? Math.max(1, packChordRows(placementsForLine(line, placements, chordById)).length) : 1
		)
	);

	/**
	 * Al arrastrar, el acorde de origen puede desaparecer del DOM (la vista previa
	 * lo pinta en otro sitio), y los `touchmove` siguen llegando a ese nodo suelto
	 * sin propagarse a `window`. Por eso el bloqueo del scroll va en el propio
	 * elemento, y a propósito sin limpieza: tiene que sobrevivir a que lo quiten.
	 */
	const blockTouchScroll: Attachment<HTMLElement> = (element) => {
		element.addEventListener(
			'touchmove',
			(event) => {
				if (drag) event.preventDefault();
			},
			{ passive: false }
		);
	};

	$effect(() => {
		const preventMenu = (event: Event) => {
			if (drag || pending) event.preventDefault();
		};
		const cancelOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && drag) endGesture();
		};
		window.addEventListener('contextmenu', preventMenu);
		window.addEventListener('keydown', cancelOnEscape);
		return () => {
			window.removeEventListener('contextmenu', preventMenu);
			window.removeEventListener('keydown', cancelOnEscape);
			endGesture();
		};
	});

	function selectChord(chordId: string) {
		if (suppressClick) return;
		placements = upsertPlacement(placements, { chordId, offset: selectedOffset });
	}

	function selectOffset(offset: number) {
		if (suppressClick) return;
		selectedOffset = offset;
	}

	function removeAt(offset: number) {
		placements = placements.filter((placement) => placement.offset !== offset);
	}

	async function moveWithKeyboard(offset: number, direction: -1 | 1) {
		const target = validOffsets[validOffsets.indexOf(offset) + direction];
		if (target === undefined || placements.some((placement) => placement.offset === target)) {
			return;
		}
		placements = movePlacement(placements, offset, direction, song.lyrics);
		selectedOffset = target;
		// El botón se recrea en su nueva posición: devolvemos el foco para poder
		// seguir moviéndolo con las flechas.
		await tick();
		editorEl?.querySelector<HTMLElement>(`[data-placement="${target}"]`)?.focus();
	}

	function onPlacedKeydown(event: KeyboardEvent, offset: number) {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			moveWithKeyboard(offset, event.key === 'ArrowLeft' ? -1 : 1);
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			removeAt(offset);
		}
	}

	function startGesture(event: PointerEvent, chordId: string, label: string, from: number | null) {
		if (saving || drag || pending || !event.isPrimary) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;

		pending = {
			pointerId: event.pointerId,
			pointerType: event.pointerType,
			chordId,
			label,
			from,
			x: event.clientX,
			y: event.clientY,
			startX: event.clientX,
			startY: event.clientY
		};
		if (event.pointerType !== 'mouse') {
			pending.timer = setTimeout(beginDrag, LONG_PRESS_MS);
		}
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerCancel);
	}

	function beginDrag() {
		if (!pending) return;
		clearTimeout(pending.timer);
		const { pointerId, pointerType, chordId, label, from, x, y } = pending;
		pending = null;
		drag = { pointerId, pointerType, chordId, label, from, x, y, target: null };
		enteredEditor = false;
		// Tras un arrastre el navegador aún dispara el `click` del origen; no
		// debe contar como "colocar en la posición seleccionada".
		suppressClick = true;
		if (pointerType !== 'mouse') navigator.vibrate?.(10);
		frame = requestAnimationFrame(followPointer);
	}

	function onPointerMove(event: PointerEvent) {
		if (drag && event.pointerId === drag.pointerId) {
			drag.x = event.clientX;
			drag.y = event.clientY;
			return;
		}
		if (!pending || event.pointerId !== pending.pointerId) return;
		pending.x = event.clientX;
		pending.y = event.clientY;
		const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
		if (pending.pointerType === 'mouse') {
			if (distance > MOUSE_THRESHOLD_PX) beginDrag();
		} else if (distance > TOUCH_SLOP_PX) {
			// Se movió antes de completar la pulsación larga: es un scroll.
			endGesture();
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (drag && event.pointerId === drag.pointerId && drag.target !== null) {
			placements = dropPlacement(placements, drag.chordId, drag.from, drag.target);
			selectedOffset = drag.target;
		}
		endGesture();
	}

	function onPointerCancel() {
		endGesture();
	}

	function endGesture() {
		if (pending) clearTimeout(pending.timer);
		pending = null;
		drag = null;
		cancelAnimationFrame(frame);
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerCancel);
		if (suppressClick) setTimeout(() => (suppressClick = false));
	}

	/**
	 * El destino se recalcula en cada frame y no en cada `pointermove`: con el
	 * autoscroll la letra se mueve bajo un dedo quieto.
	 */
	function followPointer() {
		if (!drag) return;
		const line = lineAt(drag.x, drag.y);
		drag.target = line ? targetInLine(line, drag.x) : null;
		autoscroll(drag.x, drag.y, line);
		frame = requestAnimationFrame(followPointer);
	}

	/** La línea más cercana en vertical, para que los huecos entre líneas no parpadeen. */
	function lineAt(x: number, y: number): HTMLElement | null {
		const hit = document.elementFromPoint(x, y);
		// La paleta es `sticky` y tapa la letra: soltar encima de ella cancela.
		if (!hit || !editorEl?.contains(hit)) return null;
		enteredEditor = true;

		let best: HTMLElement | null = null;
		let bestDistance = Infinity;
		for (const element of editorEl.querySelectorAll<HTMLElement>('[data-line]')) {
			const rect = element.getBoundingClientRect();
			const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
			if (distance < bestDistance) {
				best = element;
				bestDistance = distance;
			}
			if (distance === 0) break;
		}
		return best;
	}

	function targetInLine(element: HTMLElement, x: number): number | null {
		const line = lines[Number(element.dataset.line)];
		const grid = element.querySelector<HTMLElement>('[data-columns]');
		if (!line || !grid) return null;
		// La rejilla mide exactamente 1ch por columna, así que la columna sale de
		// una regla de tres con su ancho real (incluido el scroll horizontal).
		const rect = grid.getBoundingClientRect();
		const columns = Number(grid.dataset.columns);
		return offsetAtColumn(line, Math.floor(((x - rect.left) / rect.width) * columns));
	}

	function edgeSpeed(depth: number): number {
		return Math.min(AUTOSCROLL_MAX_SPEED, Math.ceil(depth / 4));
	}

	function autoscroll(x: number, y: number, line: HTMLElement | null) {
		// Hasta que el acorde no entra en la letra no hay scroll: si no, al sacar un
		// acorde de la paleta la página saldría disparada hacia arriba.
		if (!enteredEditor) return;
		// La paleta solo tapa la letra cuando va encima (móvil); en escritorio va al lado.
		const palette = paletteEl?.getBoundingClientRect();
		const editor = editorEl?.getBoundingClientRect();
		const paletteAbove = palette && editor && palette.right > editor.left;
		const top = paletteAbove ? Math.max(0, palette.bottom) : 0;
		const bottom = window.innerHeight;
		if (y > top && y < top + AUTOSCROLL_EDGE_PX) {
			window.scrollBy(0, -edgeSpeed(top + AUTOSCROLL_EDGE_PX - y));
		} else if (y > bottom - AUTOSCROLL_EDGE_PX) {
			window.scrollBy(0, edgeSpeed(y - (bottom - AUTOSCROLL_EDGE_PX)));
		}

		// En el móvil las líneas largas desbordan: la línea también se desplaza sola.
		if (line && line.scrollWidth > line.clientWidth) {
			const rect = line.getBoundingClientRect();
			const edge = Math.min(AUTOSCROLL_EDGE_PX / 2, rect.width / 4);
			if (x < rect.left + edge) line.scrollLeft -= edgeSpeed(rect.left + edge - x);
			else if (x > rect.right - edge) line.scrollLeft += edgeSpeed(x - (rect.right - edge));
		}
	}

	async function save() {
		if (saving) return;
		saving = true;
		error = null;
		try {
			const saved = await jsonRequest<Song>(`/api/songs/${song.id}`, 'PATCH', {
				chordPlacements: placements
			});
			onSaved(saved);
		} catch (requestError) {
			error =
				requestError instanceof ClientApiError
					? requestError.message
					: 'No se pudo guardar la alineación';
			saving = false;
		}
	}
</script>

{#if !song.lyrics}
	<div class="card missing">
		<p>Añade la letra antes de alinear acordes.</p>
		<a class="btn btn-primary" href={resolve('/canciones/[id]', { id: song.id })}>Editar canción</a>
	</div>
{:else if song.chords.length === 0}
	<div class="card missing">
		<p>Registra los acordes antes de alinearlos.</p>
		<a class="btn btn-primary" href={resolve('/canciones/[id]', { id: song.id })}>Editar canción</a>
	</div>
{:else}
	<div class="alignment-editor" class:dragging={drag !== null}>
		<section class="palette-wrap" aria-label="Catálogo de acordes" bind:this={paletteEl}>
			<p class="label">Arrastra un acorde a la letra</p>
			<div class="palette">
				<button
					type="button"
					class="chip remove"
					title="Quitar el acorde seleccionado"
					aria-label="Quitar el acorde seleccionado"
					disabled={saving || !selectedPlacement}
					onclick={() => removeAt(selectedOffset)}
				>
					<Icon name="trash" size={16} />
				</button>
				<span class="palette-divider" aria-hidden="true"></span>
				{#each song.chords as chord (chord.id)}
					<button
						type="button"
						class="chip mono draggable"
						class:wide={chord.value.length > WIDE_CHORD_LENGTH}
						class:source={drag?.from === null && drag.chordId === chord.id}
						aria-pressed={selectedPlacement?.chordId === chord.id}
						disabled={saving}
						onclick={() => selectChord(chord.id)}
						onpointerdown={(event) => startGesture(event, chord.id, chord.value, null)}
						{@attach blockTouchScroll}
					>
						{chord.value}
					</button>
				{/each}
			</div>
		</section>

		<div class="workspace">
			<div class="lyrics-editor" aria-label="Letra para alinear" bind:this={editorEl}>
				{#each lines as line, lineIndex (line.start)}
					{@const graphemes = splitGraphemes(line.text)}
					{@const positioned = placementsForLine(line, preview, chordById)}
					{@const rows = packChordRows(positioned)}
					{@const columns = Math.max(
						graphemes.length + 1,
						...positioned.map((chord) => chord.column + chord.label.length)
					)}
					<div class="line-scroll" data-line={lineIndex}>
						<div
							class="line-grid"
							data-columns={columns}
							style={`--columns: ${columns}; min-width: ${columns}ch`}
						>
							{#each rows as row, rowIndex (rowIndex)}
								<div class="chord-row">
									{#each row as chord (`${chord.offset}-${chord.chordId}`)}
										{@const ghost = drag !== null && drag.target === chord.offset}
										<button
											type="button"
											class="placed-chord mono draggable"
											class:selected={!drag && selectedOffset === chord.offset}
											class:ghost
											class:source={drag?.target === null && drag.from === chord.offset}
											style={`grid-column: ${chord.column + 1} / span ${Math.max(1, chord.label.length)}`}
											data-placement={chord.offset}
											aria-label={`${chord.label}. Flechas para mover, Suprimir para quitar`}
											disabled={saving}
											onclick={() => selectOffset(chord.offset)}
											onkeydown={(event) => onPlacedKeydown(event, chord.offset)}
											onpointerdown={(event) =>
												startGesture(event, chord.chordId, chord.label, chord.offset)}
											{@attach blockTouchScroll}
										>
											{chord.label}
										</button>
									{/each}
								</div>
							{/each}
							{#each { length: Math.max(0, reservedRows[lineIndex] - rows.length) }, index (index)}
								<div class="chord-row" aria-hidden="true">
									<span class="placed-chord mono spacer">&nbsp;</span>
								</div>
							{/each}
							<div class="text-row mono">
								{#each graphemes as grapheme, index (grapheme.offset)}
									{@const offset = line.start + grapheme.offset}
									<button
										type="button"
										class="character"
										class:selected={!drag && selectedOffset === offset}
										class:drop-target={drag?.target === offset}
										style={`grid-column: ${index + 1}`}
										tabindex="-1"
										aria-label={`Colocar antes de ${grapheme.text === ' ' ? 'un espacio' : grapheme.text}`}
										disabled={saving}
										onclick={() => selectOffset(offset)}
									>
										{grapheme.text === ' ' ? ' ' : grapheme.text}
									</button>
								{/each}
								<button
									type="button"
									class="character end"
									class:selected={!drag && selectedOffset === line.end}
									class:drop-target={drag?.target === line.end}
									style={`grid-column: ${graphemes.length + 1}`}
									tabindex="-1"
									aria-label="Colocar al final de la línea"
									disabled={saving}
									onclick={() => selectOffset(line.end)}
								>
									&nbsp;
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if error}<p class="error-text">{error}</p>{/if}

			<div class="save-actions">
				<button type="button" class="btn btn-subtle" disabled={saving} onclick={onCancel}>
					Cancelar
				</button>
				<button type="button" class="btn btn-primary" disabled={saving} onclick={save}>
					{#if saving}Guardando…{:else}<Icon name="check" size={16} /> Guardar alineación{/if}
				</button>
			</div>
		</div>
	</div>

	{#if drag}
		<div
			class="drag-avatar mono"
			class:touch={drag.pointerType !== 'mouse'}
			class:over={drag.target !== null}
			style={`left: ${drag.x}px; top: ${drag.y}px`}
			aria-hidden="true"
		>
			{drag.label}
		</div>
	{/if}
{/if}

<style>
	.alignment-editor {
		display: grid;
		gap: 1rem;
	}
	.alignment-editor.dragging {
		user-select: none;
		-webkit-user-select: none;
	}
	.alignment-editor.dragging,
	.alignment-editor.dragging * {
		cursor: grabbing;
	}
	.palette-wrap {
		position: sticky;
		top: 3.75rem;
		z-index: 20;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: color-mix(in srgb, var(--color-bg) 96%, transparent);
		backdrop-filter: blur(10px);
	}
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.palette .chip {
		min-height: 2.75rem;
	}
	.chip.remove {
		justify-content: center;
		min-width: 2.75rem;
	}
	.chip.remove:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.palette-divider {
		align-self: stretch;
		width: 1px;
		margin-inline: 0.25rem;
		background: var(--color-border-strong);
	}
	.draggable {
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.chip.source {
		border-style: dashed;
		opacity: 0.55;
	}
	.lyrics-editor {
		display: grid;
		gap: 0.375rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-surface);
	}
	.line-scroll {
		padding-block: 0.125rem;
		overflow-x: auto;
	}
	.line-grid {
		display: grid;
		gap: 0.125rem;
		width: max-content;
	}
	.chord-row,
	.text-row {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1ch);
	}
	.placed-chord {
		justify-self: start;
		padding: 0.125rem 0.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: var(--color-elevated);
		color: var(--color-bright);
		font-size: 0.8rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.placed-chord.selected {
		border-color: var(--color-bright);
	}
	.placed-chord.ghost {
		border-style: dashed;
		border-color: var(--color-bright);
		background: transparent;
		opacity: 0.8;
	}
	.placed-chord.source {
		opacity: 0.35;
	}
	.placed-chord.spacer {
		visibility: hidden;
	}
	.character {
		min-width: 1ch;
		height: 1.7rem;
		padding: 0;
		border: 0;
		border-left: 1px solid transparent;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		line-height: 1.7rem;
		text-align: left;
		white-space: pre;
		cursor: text;
	}
	.character.selected,
	.character.drop-target {
		border-left-color: var(--color-bright);
		background: var(--color-elevated);
	}
	.character.end {
		border-right: 1px solid var(--color-border-soft);
	}
	.drag-avatar {
		position: fixed;
		z-index: 100;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-bright);
		border-radius: var(--radius-control);
		background: var(--color-elevated);
		color: var(--color-bright);
		font-size: 0.85rem;
		font-weight: 700;
		white-space: nowrap;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
		pointer-events: none;
		transform: translate(0.75rem, 0.75rem);
	}
	/* Con el dedo encima no se vería: en táctil el acorde flota por arriba. */
	.drag-avatar.touch {
		transform: translate(-50%, calc(-100% - 2.75rem));
	}
	/* Sobre la letra ya se ve el fantasma en su sitio; el avatar pasa a segundo plano. */
	.drag-avatar.over {
		opacity: 0.5;
	}
	.save-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}
	.missing {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
	}
	.missing p {
		margin: 0;
	}
	.workspace {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}
	/* En escritorio la paleta pasa a una columna lateral fija, a la izquierda de la letra. */
	@media (min-width: 960px) {
		.alignment-editor {
			--palette-width: 11rem;
			--palette-gap: 1.25rem;
			grid-template-columns: var(--palette-width) minmax(0, 1fr);
			gap: var(--palette-gap);
			align-items: start;
		}
		.palette-wrap {
			top: 1rem;
			max-height: calc(100dvh - 2rem);
			overflow-y: auto;
		}
		.palette {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-auto-flow: row dense;
		}
		.palette .chip {
			justify-content: center;
			min-width: 0;
			overflow-wrap: anywhere;
		}
		.chip.remove,
		.chip.wide,
		.palette-divider {
			grid-column: 1 / -1;
		}
		.palette-divider {
			width: auto;
			height: 1px;
			margin: 0.125rem 0;
		}
	}
	/*
	 * Con la pantalla lo bastante ancha, la paleta sale al margen que deja la
	 * columna de contenido (64rem, ver +layout.svelte) y la letra conserva todo su
	 * ancho. 95rem = rail (13rem) + contenido (64rem) + dos veces lo que ocupa la
	 * paleta menos el padding del contenido.
	 */
	@media (min-width: 95rem) {
		.alignment-editor {
			margin-left: calc(-1 * (var(--palette-width) + var(--palette-gap)));
		}
	}
	@media (max-width: 560px) {
		.save-actions .btn {
			width: 100%;
		}
		.missing {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
