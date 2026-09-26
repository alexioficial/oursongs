<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { connection } from '$lib/offline/sync.svelte';

	// Sin conexión solo funcionan las canciones: Tags y Alinear piden al servidor.
	const offline = $derived(!connection.online && page.status !== 404);
</script>

<svelte:head><title>{offline ? 'Sin conexión' : 'Error'} · OurSongs</title></svelte:head>

{#if offline}
	<EmptyState
		title="Sin conexión"
		message="Esta pantalla necesita internet. Las canciones guardadas en el dispositivo siguen disponibles."
	>
		<a class="btn btn-primary" href={resolve('/canciones')}>Ver canciones</a>
	</EmptyState>
{:else}
	<EmptyState
		title={page.status === 404 ? 'No encontrado' : 'Algo salió mal'}
		message={page.error?.message ?? 'Vuelve a intentarlo en un momento.'}
	>
		<a class="btn btn-ghost" href={resolve('/canciones')}>Volver a canciones</a>
	</EmptyState>
{/if}
