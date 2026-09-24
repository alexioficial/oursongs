<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';

	interface Props {
		variant?: 'rail' | 'bottom';
	}
	let { variant = 'bottom' }: Props = $props();

	const items = [
		{ href: resolve('/canciones'), label: 'Canciones', icon: 'music' },
		{ href: resolve('/tags'), label: 'Tags', icon: 'tag' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return path === href || path.startsWith(href + '/');
	}
</script>

<nav class="nav {variant}" aria-label={variant === 'rail' ? 'Navegación principal' : 'Navegación'}>
	{#each items as item (item.href)}
		<a
			href={item.href}
			class="nav-item"
			class:active={isActive(item.href)}
			aria-current={isActive(item.href) ? 'page' : undefined}
		>
			<span class="nav-icon"><Icon name={item.icon} size={20} /></span>
			<span class="nav-label">{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	.nav {
		display: grid;
		gap: 0.25rem;
	}
	.bottom {
		position: fixed;
		inset: auto 0 0;
		z-index: 40;
		grid-template-columns: repeat(2, 1fr);
		padding: 0.375rem 0.5rem calc(0.375rem + env(safe-area-inset-bottom));
		border-top: 1px solid var(--color-border);
		background: color-mix(in srgb, var(--color-bg) 94%, transparent);
		backdrop-filter: blur(12px);
	}
	.rail {
		grid-template-columns: 1fr;
		align-content: start;
	}
	.nav-item {
		display: flex;
		min-height: 2.875rem;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-left: 3px solid transparent;
		color: var(--color-muted);
		text-decoration: none;
	}
	@media (hover: hover) {
		.nav-item:hover {
			background: var(--color-surface);
			color: var(--color-text);
		}
	}
	.nav-item:active {
		background: var(--color-surface-2);
	}
	.nav-item.active {
		border-left-color: var(--color-bright);
		background: var(--color-surface);
		color: var(--color-bright);
	}
	.nav-label {
		font-size: 0.9rem;
		font-weight: 600;
	}
	.nav-icon {
		display: grid;
		flex: 0 0 1.5rem;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
	}
	.bottom .nav-item {
		flex-direction: column;
		justify-content: center;
		gap: 0.125rem;
		min-height: 3.5rem;
		padding: 0.375rem 0.25rem;
		border-top: 2px solid transparent;
		border-left: 0;
	}
	.bottom .nav-item.active {
		border-top-color: var(--color-bright);
		background: transparent;
	}
	.bottom .nav-label {
		font-size: 0.7rem;
	}
	@media (min-width: 960px) {
		.bottom {
			display: none;
		}
	}
	@media (max-width: 959px) {
		.rail {
			display: none;
		}
	}
</style>
