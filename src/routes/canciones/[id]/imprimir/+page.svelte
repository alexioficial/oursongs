<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import PrintSheet from '$lib/components/PrintSheet.svelte';
	import { formatSemitones, wrapSemitones } from '$lib/music/chords';
	import {
		columnCapacity,
		DEFAULT_PRINT_SETTINGS,
		isDefaultPrintSettings,
		loadPrintSettings,
		PAGE_MARGIN_X,
		PAGE_MARGIN_Y,
		PAPER_SIZES,
		PAPERS,
		PRINT_COLORS,
		savePrintSettings,
		TEXT_SCALE_MAX,
		TEXT_SCALE_MIN,
		TEXT_SCALE_STEP
	} from '$lib/print';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// La página no se pinta en el servidor (ver +page.ts), así que lo guardado en
	// el dispositivo se puede leer ya, sin pasar antes por las opciones por defecto.
	const settings = $state(loadPrintSettings());
	$effect(() => savePrintSettings($state.snapshot(settings)));

	// La ficha manda la transposición que se estaba viendo: se imprime eso.
	let semitones = $state(
		untrack(() => wrapSemitones(Number(page.url.searchParams.get('tono')) || 0))
	);

	const songTags = $derived(
		data.song.tagIds
			.map((id) => data.tags.find((tag) => tag.id === id))
			.filter((tag) => tag !== undefined)
	);
	// Chrome propone el título de la página como nombre del PDF.
	const documentTitle = $derived(
		data.song.artist ? `${data.song.title} - ${data.song.artist}` : data.song.title
	);

	/*
	 * Cuánto cabe por línea depende del ancho de un carácter de la fuente
	 * monoespaciada, que cambia según el sistema. Se mide una vez con un texto
	 * largo a 100px: el redondeo de offsetWidth se queda en nada.
	 */
	const PROBE_CHARS = 50;
	const PROBE_SIZE_PX = 100;
	let probe = $state<HTMLElement>();
	let advance = $state(0.6);
	$effect(() => {
		const element = probe;
		if (!element) return;
		const measure = () => {
			if (element.offsetWidth > 0) advance = element.offsetWidth / PROBE_CHARS / PROBE_SIZE_PX;
		};
		measure();
		void document.fonts?.ready.then(measure);
	});
	const capacity = $derived(columnCapacity(settings, advance));

	// Lo que entiende el diálogo de imprimir: tamaño de papel y márgenes. Va en una
	// hoja de estilos aparte porque la del componente no admite valores dinámicos
	// (y la etiqueta no se puede nombrar aquí: el preprocesador la tomaría por la
	// del componente).
	$effect(() => {
		const style = document.createElement('style');
		style.textContent = `@page { size: ${PAPERS[settings.paper].css}; margin: ${PAGE_MARGIN_Y}mm ${PAGE_MARGIN_X}mm; }`;
		document.head.append(style);
		return () => style.remove();
	});

	// La hoja se pinta a tamaño real; si no cabe a lo ancho se reduce entera.
	let previewWidth = $state(0);
	const zoom = $derived(
		previewWidth > 0 ? Math.min(1, previewWidth / ((PAPERS[settings.paper].width * 96) / 25.4)) : 1
	);

	type Menu = 'paper' | 'text' | 'colors';
	let open = $state<Menu | null>(null);
	let panel = $state<HTMLElement>();

	function toggle(menu: Menu) {
		open = open === menu ? null : menu;
	}

	function closeOnOutsideClick(event: PointerEvent) {
		if (open && panel && !panel.contains(event.target as Node)) open = null;
	}

	function closeOnEscape(event: KeyboardEvent) {
		if (event.key === 'Escape') open = null;
	}

	function shift(step: number) {
		semitones = wrapSemitones(semitones + step);
	}

	const isDefault = $derived(isDefaultPrintSettings(settings) && semitones === 0);

	function reset() {
		Object.assign(settings, DEFAULT_PRINT_SETTINGS);
		semitones = 0;
		open = null;
	}

	function print() {
		open = null;
		window.print();
	}

	const presetColors: readonly string[] = PRINT_COLORS.map(({ value }) => value);
</script>

<svelte:head><title>{documentTitle}</title></svelte:head>
<svelte:window onpointerdown={closeOnOutsideClick} onkeydown={closeOnEscape} />

{#snippet palette(
	label: string,
	colorKey: 'lyricsColor' | 'chordsColor',
	boldKey: 'lyricsBold' | 'chordsBold'
)}
	<div class="palette" role="group" aria-label={label}>
		<p class="palette-label">{label}</p>
		<div class="swatches">
			{#each PRINT_COLORS as swatch (swatch.value)}
				<button
					type="button"
					class="swatch"
					style:--swatch={swatch.value}
					title={swatch.name}
					aria-label={swatch.name}
					aria-pressed={settings[colorKey] === swatch.value}
					onclick={() => (settings[colorKey] = swatch.value)}
				></button>
			{/each}
			<label
				class="swatch custom"
				class:selected={!presetColors.includes(settings[colorKey])}
				style:--swatch={settings[colorKey]}
				title="Otro color"
			>
				<input
					type="color"
					aria-label="Otro color"
					value={settings[colorKey]}
					oninput={(event) => (settings[colorKey] = event.currentTarget.value)}
				/>
			</label>
			<button
				type="button"
				class="bold"
				title="Negrita"
				aria-label="Negrita"
				aria-pressed={settings[boldKey]}
				onclick={() => (settings[boldKey] = !settings[boldKey])}
			>
				N
			</button>
		</div>
	</div>
{/snippet}

<div class="print-page">
	<aside class="panel" bind:this={panel} aria-label="Opciones de impresión">
		<a class="back" href={resolve('/canciones/[id]', { id: data.song.id })}>
			<Icon name="back" size={16} /> Volver a la canción
		</a>

		<div class="group">
			<div class="option">
				<button
					type="button"
					class="row"
					aria-expanded={open === 'paper'}
					aria-controls="print-paper"
					onclick={() => toggle('paper')}
				>
					<Icon name="file" size={20} />
					<span class="row-label">Papel</span>
					<span class="row-value">{PAPERS[settings.paper].label}</span>
				</button>
				{#if open === 'paper'}
					<fieldset id="print-paper" class="flyout choices">
						<legend class="sr-only">Tamaño del papel</legend>
						{#each PAPER_SIZES as size (size)}
							<label class="choice">
								<span>
									{PAPERS[size].label}
									<small>{PAPERS[size].dimensions}</small>
								</span>
								<input type="radio" name="paper" value={size} bind:group={settings.paper} />
							</label>
						{/each}
					</fieldset>
				{/if}
			</div>

			<div class="option">
				<button
					type="button"
					class="row"
					aria-expanded={open === 'text'}
					aria-controls="print-text"
					onclick={() => toggle('text')}
				>
					<Icon name="type" size={20} />
					<span class="row-label">Texto</span>
					<span class="row-value">{settings.textScale}%</span>
				</button>
				{#if open === 'text'}
					<div id="print-text" class="flyout">
						<div class="slider">
							<Icon name="type" size={14} />
							<input
								type="range"
								min={TEXT_SCALE_MIN}
								max={TEXT_SCALE_MAX}
								step={TEXT_SCALE_STEP}
								aria-label="Tamaño del texto"
								aria-valuetext="{settings.textScale}%"
								bind:value={settings.textScale}
							/>
							<Icon name="type" size={22} />
						</div>
						{#if settings.textScale !== DEFAULT_PRINT_SETTINGS.textScale}
							<button
								type="button"
								class="btn btn-ghost flyout-reset"
								onclick={() => (settings.textScale = DEFAULT_PRINT_SETTINGS.textScale)}
							>
								<Icon name="reset" size={16} /> Restablecer
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<div class="option">
				<button
					type="button"
					class="row"
					aria-expanded={open === 'colors'}
					aria-controls="print-colors"
					onclick={() => toggle('colors')}
				>
					<Icon name="droplet" size={20} />
					<span class="row-label">Colores</span>
					<span class="row-value dots" aria-hidden="true">
						<span class="dot" style:--swatch={settings.chordsColor}></span>
						<span class="dot" style:--swatch={settings.lyricsColor}></span>
					</span>
				</button>
				{#if open === 'colors'}
					<div id="print-colors" class="flyout palettes">
						{@render palette('Letra y títulos', 'lyricsColor', 'lyricsBold')}
						{@render palette('Acordes y artista', 'chordsColor', 'chordsBold')}
					</div>
				{/if}
			</div>
		</div>

		<div class="group">
			<div class="row static">
				<Icon name="plusminus" size={20} />
				<span class="row-label">Tono</span>
				<span class="stepper">
					<button
						type="button"
						class="step"
						title="Bajar un semitono"
						aria-label="Bajar un semitono"
						disabled={!settings.showChords}
						onclick={() => shift(-1)}
					>
						<Icon name="minus" size={15} />
					</button>
					<span class="row-value steps mono" aria-live="polite">
						{semitones === 0 ? 'Original' : formatSemitones(semitones)}
					</span>
					<button
						type="button"
						class="step"
						title="Subir un semitono"
						aria-label="Subir un semitono"
						disabled={!settings.showChords}
						onclick={() => shift(1)}
					>
						<Icon name="plus" size={15} />
					</button>
				</span>
			</div>
		</div>

		<div class="group">
			<button
				type="button"
				class="row"
				role="switch"
				aria-checked={settings.twoColumns}
				onclick={() => (settings.twoColumns = !settings.twoColumns)}
			>
				<Icon name="columns" size={20} />
				<span class="row-label">Dos columnas</span>
				<span class="switch" aria-hidden="true"></span>
			</button>
			<button
				type="button"
				class="row"
				role="switch"
				aria-checked={settings.showChords}
				onclick={() => (settings.showChords = !settings.showChords)}
			>
				<Icon name="music" size={20} />
				<span class="row-label">Acordes</span>
				<span class="switch" aria-hidden="true"></span>
			</button>
		</div>

		<button type="button" class="btn btn-primary action" onclick={print}>
			<Icon name="printer" size={18} /> Imprimir
		</button>
		<button type="button" class="btn btn-ghost action" disabled={isDefault} onclick={reset}>
			<Icon name="reset" size={16} /> Restablecer
		</button>
	</aside>

	<div class="preview">
		<div class="preview-fit" bind:clientWidth={previewWidth}>
			<div class="frame" style:zoom>
				<PrintSheet song={data.song} tags={songTags} {settings} {semitones} {capacity} />
			</div>
		</div>
	</div>

	<span class="probe" bind:this={probe} aria-hidden="true">{'M'.repeat(PROBE_CHARS)}</span>
</div>

<style>
	.print-page {
		display: grid;
		gap: 1.25rem;
		min-height: 100dvh;
		padding: calc(1rem + env(safe-area-inset-top)) 1rem calc(1.5rem + env(safe-area-inset-bottom));
	}
	.panel {
		display: grid;
		align-content: start;
		gap: 0.75rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.25rem;
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
	.group {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-surface);
	}
	.option + .option,
	.row + .row {
		border-top: 1px solid var(--color-border-soft);
	}
	.option {
		position: relative;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		width: 100%;
		min-height: 3.25rem;
		padding: 0.5rem 1rem;
		border: 0;
		border-radius: var(--radius-overlay);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.row.static {
		cursor: default;
	}
	@media (hover: hover) {
		button.row:hover {
			background: var(--color-surface-2);
		}
	}
	.row[aria-expanded='true'] {
		background: var(--color-surface-2);
	}
	.row-label {
		flex: 1;
		font-size: 0.92rem;
		font-weight: 600;
	}
	.row-value {
		color: var(--color-subtle);
		font-size: 0.82rem;
	}
	.dots {
		display: flex;
		gap: 0.375rem;
	}
	.dot {
		width: 1.125rem;
		height: 1.125rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 50%;
		background: var(--swatch);
	}

	/* En el móvil las opciones se abren debajo de su fila; en escritorio, al lado. */
	.flyout {
		margin: 0;
		padding: 0.75rem 1rem 1rem;
		border: 0;
		border-top: 1px solid var(--color-border-soft);
	}
	.choices {
		display: grid;
		gap: 0.125rem;
		padding-block: 0.5rem;
	}
	.choice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 2.75rem;
		font-size: 0.92rem;
		cursor: pointer;
	}
	.choice small {
		display: block;
		color: var(--color-muted);
		font-size: 0.72rem;
	}
	/* El plugin de formularios de Tailwind pinta el marcado con currentColor. */
	.choice input {
		width: 1.125rem;
		height: 1.125rem;
		border-color: var(--color-border-strong);
		background-color: var(--color-surface-2);
		color: var(--color-bright);
	}
	.choice input:checked {
		background-color: var(--color-bright);
	}
	.choice input:focus {
		--tw-ring-color: var(--color-bright);
		--tw-ring-offset-color: var(--color-surface);
	}
	.slider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-subtle);
	}
	.slider input {
		flex: 1;
		accent-color: var(--color-bright);
	}
	.flyout-reset {
		width: 100%;
		margin-top: 0.75rem;
	}
	.palettes {
		display: grid;
		gap: 1rem;
	}
	.palette + .palette {
		padding-top: 1rem;
		border-top: 1px solid var(--color-border-soft);
	}
	.palette-label {
		margin: 0 0 0.625rem;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.swatch {
		position: relative;
		width: 1.625rem;
		height: 1.625rem;
		padding: 0;
		border: 1px solid var(--color-border-strong);
		border-radius: 50%;
		background: var(--swatch);
		cursor: pointer;
	}
	.swatch[aria-pressed='true'],
	.swatch.selected {
		box-shadow:
			0 0 0 2px var(--color-surface),
			0 0 0 4px var(--color-bright);
	}
	/* El de "otro color": arcoíris hasta que se elige uno propio. */
	.custom:not(.selected) {
		background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
	}
	.custom input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	.custom:focus-within {
		outline: 2px solid var(--color-bright);
		outline-offset: 2px;
	}
	.bold {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		margin-left: auto;
		padding: 0;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--color-subtle);
		font-weight: 700;
		cursor: pointer;
	}
	.bold[aria-pressed='true'] {
		border-color: var(--color-bright);
		background: var(--color-bright);
		color: var(--color-bg);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.step {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--color-border-strong);
		border-radius: 50%;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
	}
	.step:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	@media (hover: hover) {
		.step:hover:not(:disabled) {
			background: var(--color-surface-2);
		}
	}
	.steps {
		min-width: 4.5rem;
		text-align: center;
	}

	.switch {
		position: relative;
		width: 2.5rem;
		height: 1.375rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 999px;
		background: var(--color-surface-2);
		transition: background 0.15s;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 0.1875rem;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		background: var(--color-subtle);
		transform: translateY(-50%);
		transition:
			transform 0.15s,
			background 0.15s;
	}
	.row[aria-checked='true'] .switch {
		border-color: var(--color-bright);
		background: var(--color-bright);
	}
	.row[aria-checked='true'] .switch::after {
		background: var(--color-bg);
		transform: translate(1.125rem, -50%);
	}

	.action {
		width: 100%;
		min-height: 3rem;
	}

	.preview {
		min-width: 0;
	}
	.preview-fit {
		display: flex;
		justify-content: center;
	}

	/* Fuera de la vista previa: el zoom no afecta a la medida. */
	.probe {
		position: fixed;
		top: 0;
		left: 0;
		font-family: var(--font-mono);
		font-size: 100px;
		white-space: pre;
		visibility: hidden;
		pointer-events: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (min-width: 960px) {
		.print-page {
			grid-template-columns: minmax(0, 1fr) 20rem;
			align-items: start;
			gap: 2rem;
			padding: 2rem;
		}
		.panel {
			position: sticky;
			top: 2rem;
			order: 2;
		}
		.flyout {
			position: absolute;
			top: 0;
			right: calc(100% + 0.75rem);
			z-index: 10;
			/* Lo justo para que cada paleta quepa en una sola fila. */
			width: 21.5rem;
			border: 1px solid var(--color-border);
			border-radius: var(--radius-overlay);
			background: var(--color-surface);
			box-shadow: 0 16px 40px rgb(0 0 0 / 0.35);
		}
	}

	/* Al imprimir solo queda la hoja, en blanco, sea cual sea el tema. */
	@media print {
		:global(html:has(.print-page)),
		:global(body:has(.print-page)) {
			background: #fff;
		}
		.panel,
		.probe {
			display: none;
		}
		.print-page {
			display: block;
			min-height: 0;
			padding: 0;
		}
		/*
		 * Sin flex: dentro de un flex la hoja (con `width: auto` al imprimir) se
		 * encoge a su línea más larga y sale centrada. Con dos columnas no se nota
		 * porque las columnas llenan el ancho; con una sí.
		 */
		.preview-fit {
			display: block;
		}
		.frame {
			zoom: 1 !important;
		}
	}
</style>
