<script lang="ts">
	import { pending, sync, synchronize } from '$lib/offline/sync.svelte';

	let justFinished = $state(false);

	// "Al día" se enseña un momento y se va: lo normal es no ver nada.
	$effect(() => {
		if (sync.phase !== 'done') return;
		justFinished = true;
		const timer = setTimeout(() => (justFinished = false), 2500);
		return () => clearTimeout(timer);
	});

	const busy = $derived(sync.phase === 'uploading' || sync.phase === 'downloading');
	const unsent = $derived(pending.songs.length);
	const percent = $derived(sync.total > 0 ? Math.round((sync.done / sync.total) * 100) : null);

	const label = $derived.by(() => {
		switch (sync.phase) {
			case 'uploading':
				return `Subiendo ${sync.done} de ${sync.total}`;
			case 'downloading':
				return sync.total > 0
					? `Descargando canciones ${sync.done} de ${sync.total}`
					: 'Descargando canciones…';
			case 'offline':
				return unsent > 0 ? `Sin conexión · ${unsent} sin subir` : 'Sin conexión';
			case 'error':
				return sync.message ?? 'No se pudo sincronizar';
			default:
				return 'Canciones al día';
		}
	});

	const visible = $derived(
		busy || sync.phase === 'offline' || sync.phase === 'error' || justFinished
	);
</script>

{#if visible}
	<div class="sync" class:error={sync.phase === 'error'} role="status" aria-live="polite">
		<span class="text">{label}</span>
		{#if sync.phase === 'error'}
			<button type="button" class="retry" onclick={() => void synchronize()}>Reintentar</button>
		{/if}
		{#if busy}
			<span class="track" aria-hidden="true">
				<span
					class="fill"
					class:indeterminate={percent === null}
					style={percent === null ? undefined : `width: ${percent}%`}
				></span>
			</span>
		{/if}
	</div>
{/if}

<style>
	.sync {
		position: fixed;
		right: 1rem;
		bottom: calc(4.5rem + env(safe-area-inset-bottom));
		z-index: 45;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.375rem 0.625rem;
		width: min(15rem, calc(100vw - 2rem));
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--color-surface) 92%, transparent);
		backdrop-filter: blur(8px);
		color: var(--color-muted);
		font-size: 0.72rem;
		line-height: 1.3;
		animation: appear 180ms ease-out;
	}
	.sync.error {
		border-color: var(--color-border-strong);
		color: var(--color-subtle);
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.retry {
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-text);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.track {
		grid-column: 1 / -1;
		position: relative;
		height: 2px;
		overflow: hidden;
		border-radius: 1px;
		background: var(--color-border);
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--color-bright);
		transition: width 200ms ease-out;
	}
	.fill.indeterminate {
		width: 35%;
		animation: slide 1.1s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
	@keyframes appear {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}
	@media (min-width: 960px) {
		.sync {
			bottom: 1rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sync,
		.fill.indeterminate {
			animation: none;
		}
	}
</style>
