<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		icon?: string;
		title: string;
		message?: string;
		children?: Snippet;
	}
	let { icon = 'music', title, message = '', children }: Props = $props();
</script>

<div class="empty">
	<div class="empty-copy">
		<Icon name={icon} size={18} />
		<div>
			<h3 class="empty-title">{title}</h3>
			{#if message}<p class="empty-msg">{message}</p>{/if}
		</div>
	</div>
	{#if children}
		<div class="empty-action">{@render children()}</div>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 0;
		border-block: 1px solid var(--color-border);
	}
	.empty-copy {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		color: var(--color-subtle);
	}
	.empty-title {
		margin: 0;
		color: var(--color-text);
		font-size: 1.05rem;
		font-weight: 600;
	}
	.empty-msg {
		max-width: 26rem;
		margin: 0.25rem 0 0;
		color: var(--color-muted);
		font-size: 0.875rem;
	}
	.empty-action {
		flex: 0 0 auto;
	}
	@media (max-width: 520px) {
		.empty {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
