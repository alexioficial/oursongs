<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ChordAlignmentEditor from '$lib/components/ChordAlignmentEditor.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const detailUrl = $derived(resolve('/canciones/[id]', { id: data.song.id }));

	function close() {
		return goto(detailUrl);
	}

	function saved() {
		return goto(detailUrl, { invalidateAll: true });
	}
</script>

<svelte:head><title>Alinear acordes · {data.song.title} · OurSongs</title></svelte:head>

<a class="back" href={detailUrl}><Icon name="back" size={16} /> Volver a la canción</a>

<PageHeader title="Alinear acordes" subtitle={data.song.title} />

<p class="intro muted">
	Arrastra un acorde hasta su sitio en la letra; mientras lo arrastras verás cómo queda. En el
	móvil, mantén pulsado el acorde un instante antes de arrastrarlo. También puedes tocar una
	posición y luego el acorde. Cada acorde se puede usar cuantas veces necesites.
</p>

<ChordAlignmentEditor song={data.song} onSaved={saved} onCancel={close} />

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
	.intro {
		max-width: 42rem;
		margin: -1rem 0 1.5rem;
		font-size: 0.9rem;
	}
</style>
