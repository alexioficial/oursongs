<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import type { Tag } from '$lib/types';

	interface Props {
		tags: Tag[];
		/** Ids seleccionados; el componente los actualiza en el padre. */
		selected: string[];
	}
	let { tags, selected = $bindable() }: Props = $props();

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
	}
</script>

{#if tags.length === 0}
	<p class="hint">
		Todavía no hay tags. Se crean en la pantalla de <a href={resolve('/tags')}>Tags</a>.
	</p>
{:else}
	<div class="picker">
		{#each tags as tag (tag.id)}
			<button
				type="button"
				class="chip"
				aria-pressed={selected.includes(tag.id)}
				onclick={() => toggle(tag.id)}
			>
				{#if selected.includes(tag.id)}<Icon name="check" size={14} />{/if}
				{tag.name}
			</button>
		{/each}
	</div>
{/if}

<style>
	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	a {
		color: var(--color-text);
	}
</style>
