<script lang="ts">
	import { packChordRows, placementsForLine, splitLyricLines } from '$lib/music/chordPlacements';
	import { transposeChords } from '$lib/music/chords';
	import { chordRowText, wrapChordLine } from '$lib/music/printLayout';
	import {
		COLUMN_GAP,
		LYRICS_FONT_PT,
		PAGE_MARGIN_X,
		PAGE_MARGIN_Y,
		PAPERS,
		type PrintSettings
	} from '$lib/print';
	import type { Song, Tag } from '$lib/types';

	interface Props {
		song: Song;
		/** Los tags de la canción, ya resueltos. */
		tags: Tag[];
		settings: PrintSettings;
		semitones: number;
		/** Columnas de texto que caben en una columna de la hoja (ver `columnCapacity`). */
		capacity: number;
	}

	let { song, tags, settings, semitones, capacity }: Props = $props();

	const paper = $derived(PAPERS[settings.paper]);

	// La escritura (♯/♭) se decide para la canción entera, como en la ficha.
	const chordById = $derived.by(() => {
		const labels = transposeChords(
			song.chords.map(({ value }) => value),
			semitones
		);
		return new Map(song.chords.map(({ id }, index) => [id, labels[index]]));
	});

	const lines = $derived(
		splitLyricLines(song.lyrics).flatMap((line) => {
			const positioned = placementsForLine(line, song.chordPlacements, chordById);
			const empty = line.text.trim() === '';
			// Una línea de solo acordes (una intro, un final) sin acordes no es nada:
			// se quita entera en vez de dejar un hueco.
			if (!settings.showChords && empty && positioned.length > 0) return [];
			const chords = settings.showChords ? positioned : [];
			return [
				{
					start: line.start,
					blank: empty && chords.length === 0,
					parts: wrapChordLine(line.text, chords, capacity).map((part) => ({
						rows: packChordRows(part.chords).map(chordRowText),
						text: part.text
					}))
				}
			];
		})
	);
</script>

<!--
	Los tamaños van en mm y pt, no en px ni rem: son unidades físicas que valen lo
	mismo en la vista previa que en el papel, y así lo que se ve es lo que sale.
-->
<article
	class="sheet"
	style:--paper-width="{paper.width}mm"
	style:--paper-height="{paper.height}mm"
	style:--margin-x="{PAGE_MARGIN_X}mm"
	style:--margin-y="{PAGE_MARGIN_Y}mm"
	style:--gap="{COLUMN_GAP}mm"
	style:--columns={settings.twoColumns ? 2 : 1}
	style:--font-size="{(LYRICS_FONT_PT * settings.textScale) / 100}pt"
	style:--scale={settings.textScale / 100}
	style:--lyrics-color={settings.lyricsColor}
	style:--lyrics-weight={settings.lyricsBold ? 700 : 400}
	style:--chords-color={settings.chordsColor}
	style:--chords-weight={settings.chordsBold ? 700 : 400}
>
	<header class="head">
		<h1 class="title">{song.title}</h1>
		{#if song.artist}<p class="artist">{song.artist}</p>{/if}
		{#if song.rhythm || tags.length > 0}
			<dl class="meta">
				{#if song.rhythm}
					<div>
						<dt>Ritmo:</dt>
						<dd>{song.rhythm}</dd>
					</div>
				{/if}
				{#if tags.length > 0}
					<div>
						<dt>Tags:</dt>
						<dd>{tags.map(({ name }) => name).join(', ')}</dd>
					</div>
				{/if}
			</dl>
		{/if}
	</header>

	{#if song.lyrics}
		<div class="body">
			{#each lines as line (line.start)}
				{#if line.blank}
					<div class="blank"></div>
				{:else}
					<!-- Una línea partida en varios trozos no se separa entre columnas. -->
					<div class="line">
						{#each line.parts as part, partIndex (partIndex)}
							{#each part.rows as row, rowIndex (rowIndex)}
								<div class="chords">{row}</div>
							{/each}
							{#if part.text || part.rows.length === 0}
								<div class="text">{part.text}</div>
							{/if}
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<p class="empty">Esta canción todavía no tiene letra.</p>
	{/if}
</article>

<style>
	/*
	 * Colores fijos a propósito: es papel, y sale blanco también con el tema
	 * oscuro. Los del texto los elige quien imprime.
	 */
	.sheet {
		box-sizing: border-box;
		width: var(--paper-width);
		min-height: var(--paper-height);
		padding: var(--margin-y) var(--margin-x);
		background: #fff;
		color: var(--lyrics-color);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.25),
			0 12px 32px rgb(0 0 0 / 0.2);
		font-family: var(--font-sans);
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}
	.head {
		margin-bottom: calc(8mm * var(--scale));
		break-inside: avoid;
		break-after: avoid;
	}
	.title {
		margin: 0;
		color: var(--lyrics-color);
		font-size: calc(17pt * var(--scale));
		font-weight: 700;
		line-height: 1.2;
	}
	.artist {
		margin: 0.2em 0 0;
		color: var(--chords-color);
		font-size: calc(13pt * var(--scale));
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1.2;
		text-transform: uppercase;
	}
	.meta {
		display: grid;
		gap: 0.3em;
		margin: 1.1em 0 0;
		font-size: calc(9.5pt * var(--scale));
	}
	.meta div {
		display: flex;
		gap: 0.35em;
	}
	.meta dt {
		color: var(--lyrics-color);
		font-weight: 700;
	}
	.meta dd {
		margin: 0;
		color: var(--chords-color);
		font-weight: 700;
	}
	.body {
		column-count: var(--columns);
		column-gap: var(--gap);
		font-family: var(--font-mono);
		font-size: var(--font-size);
		line-height: 1.3;
	}
	.line {
		break-inside: avoid;
	}
	/* Sin recortes ni saltos: el reparto ya viene hecho y cada espacio cuenta. */
	.chords,
	.text {
		white-space: pre;
	}
	.chords {
		color: var(--chords-color);
		font-weight: var(--chords-weight);
	}
	.text {
		min-height: 1.3em;
		color: var(--lyrics-color);
		font-weight: var(--lyrics-weight);
	}
	.blank {
		height: 0.9em;
	}
	.empty {
		margin: 0;
		color: #5f6368;
		font-size: var(--font-size);
	}

	/* En el papel los márgenes los pone `@page` (ver la pantalla de imprimir). */
	@media print {
		.sheet {
			width: auto;
			min-height: 0;
			padding: 0;
			box-shadow: none;
		}
	}
</style>
