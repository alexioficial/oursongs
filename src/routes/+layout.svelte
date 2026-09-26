<script lang="ts">
	import './layout.css';
	import { untrack } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Nav from '$lib/components/Nav.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { clearOfflineData, pending, startOffline } from '$lib/offline/sync.svelte';
	import { THEME_COOKIE, type Theme } from '$lib/theme';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	const bare = $derived(page.url.pathname === '/login');

	// El servidor ya pintó el <html> con este tema; a partir de aquí lo lleva el cliente.
	let theme = $state<Theme>(untrack(() => data.theme));
	const nextThemeLabel = $derived(theme === 'dark' ? 'Modo claro' : 'Modo oscuro');

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		// Un año: es una preferencia del dispositivo, no de la sesión.
		document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
	}

	// Cada entrada a la app sube lo pendiente y descarga el repertorio entero.
	$effect(() => {
		if (data.user) startOffline(data.user);
	});

	let confirmingLogout = $state(false);

	function logout() {
		// Cerrar sesión borra la copia del dispositivo, y con ella lo no subido.
		if (pending.songs.length > 0) confirmingLogout = true;
		else void signOut();
	}

	async function signOut() {
		await clearOfflineData();
		await fetch('/api/auth/logout', {
			method: 'POST',
			headers: { accept: 'application/json' }
		}).catch(() => undefined);
		// Recarga completa para no dejar en memoria datos de la sesión anterior.
		window.location.assign(resolve('/login'));
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if bare}
	{@render children()}
{:else}
	<div class="app-shell">
		<aside class="desktop-rail">
			<a href={resolve('/canciones')} class="brand rail-brand" aria-label="OurSongs">
				<span class="brand-mark"><Icon name="music" size={17} /></span>
				<span class="brand-word">OURSONGS</span>
			</a>

			<Nav variant="rail" />

			<div class="rail-account">
				{#if data.user}
					<div class="rail-user">
						<span class="rail-user-label">Sesión</span>
						<strong title={data.user.username}>{data.user.name ?? data.user.username}</strong>
					</div>
				{/if}
				<button class="rail-action" onclick={toggleTheme}>
					<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
					<span>{nextThemeLabel}</span>
				</button>
				<button class="rail-action" onclick={logout}>
					<Icon name="logout" size={18} />
					<span>Cerrar sesión</span>
				</button>
			</div>
		</aside>

		<div class="app-main">
			<header class="topbar">
				<div class="topbar-inner">
					<a href={resolve('/canciones')} class="brand" aria-label="OurSongs">
						<span class="brand-mark"><Icon name="music" size={16} /></span>
						<span class="brand-word">OURSONGS</span>
					</a>
					<div class="account">
						{#if data.user}
							<span class="user-name subtle" title={data.user.username}>
								{data.user.name ?? data.user.username}
							</span>
						{/if}
						<button
							class="icon-btn"
							title={nextThemeLabel}
							aria-label={nextThemeLabel}
							onclick={toggleTheme}
						>
							<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
						</button>
						<button
							class="icon-btn"
							title="Cerrar sesión"
							aria-label="Cerrar sesión"
							onclick={logout}
						>
							<Icon name="logout" size={18} />
						</button>
					</div>
				</div>
			</header>

			<main class="content">{@render children()}</main>
		</div>

		<Nav variant="bottom" />
		<SyncStatus />
	</div>

	<ConfirmDialog
		open={confirmingLogout}
		title="¿Cerrar sesión?"
		message={`Tienes ${pending.songs.length} ${pending.songs.length === 1 ? 'canción' : 'canciones'} sin subir. Si cierras sesión ahora se perderán.`}
		confirmLabel="Cerrar sesión"
		onConfirm={signOut}
		onCancel={() => (confirmingLogout = false)}
	/>
{/if}

<style>
	.app-shell {
		min-height: 100dvh;
	}
	.desktop-rail {
		display: none;
	}
	.topbar {
		position: sticky;
		top: 0;
		z-index: 30;
		padding: calc(0.625rem + env(safe-area-inset-top)) 1rem 0.625rem;
		border-bottom: 1px solid var(--color-border);
		background: color-mix(in srgb, var(--color-bg) 94%, transparent);
		backdrop-filter: blur(12px);
	}
	.topbar-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		color: var(--color-text);
		text-decoration: none;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-control);
		color: var(--color-bright);
	}
	.brand-word {
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.14em;
	}
	.account {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.user-name {
		max-width: 10rem;
		overflow: hidden;
		font-size: 0.875rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.content {
		width: min(100%, 64rem);
		margin-inline: auto;
		padding: 1.5rem 1rem calc(5.75rem + env(safe-area-inset-bottom));
	}
	@media (max-width: 400px) {
		.user-name {
			display: none;
		}
	}
	@media (min-width: 960px) {
		.app-shell {
			display: grid;
			grid-template-columns: 13rem minmax(0, 1fr);
		}
		.desktop-rail {
			position: sticky;
			top: 0;
			display: grid;
			grid-template-rows: auto 1fr auto;
			gap: 2rem;
			height: 100dvh;
			padding: 1.5rem 1rem;
			border-right: 1px solid var(--color-border);
			background: var(--color-bg);
		}
		.rail-brand {
			padding-inline: 0.75rem;
		}
		.rail-account {
			display: grid;
			gap: 0.25rem;
			padding-top: 1rem;
			border-top: 1px solid var(--color-border);
		}
		.rail-user {
			display: grid;
			gap: 0.125rem;
			min-width: 0;
			padding: 0.5rem 0.75rem 0.75rem;
		}
		.rail-user-label {
			color: var(--color-muted);
			font-size: 0.7rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}
		.rail-user strong {
			overflow: hidden;
			color: var(--color-subtle);
			font-size: 0.9rem;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.rail-action {
			display: flex;
			min-height: 2.75rem;
			align-items: center;
			gap: 0.75rem;
			padding: 0.5rem 0.75rem;
			border: 0;
			background: transparent;
			color: var(--color-muted);
			font-size: 0.875rem;
			text-align: left;
			cursor: pointer;
		}
		@media (hover: hover) {
			.rail-action:hover {
				background: var(--color-surface);
				color: var(--color-text);
			}
		}
		.app-main {
			min-width: 0;
		}
		.topbar {
			display: none;
		}
		.content {
			padding: 2.5rem clamp(2rem, 5vw, 3.5rem) 4rem;
		}
	}
</style>
