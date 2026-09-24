<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { ClientApiError, jsonRequest } from '$lib/client/json';

	let loading = $state(false);
	let loginError = $state<string | null>(null);

	/**
	 * A dónde volver tras entrar. Solo se aceptan rutas internas: un
	 * `redirectTo=https://…` convertiría el login en un salto a otro sitio.
	 */
	function safeRedirect(): string {
		const target = page.url.searchParams.get('redirectTo') ?? '';
		const internal = target.startsWith('/') && !target.startsWith('//');
		return internal ? target : '/canciones';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (loading) return;

		const form = new FormData(event.currentTarget as HTMLFormElement);
		loading = true;
		loginError = null;
		try {
			await jsonRequest('/api/auth/login', 'POST', {
				username: String(form.get('username') ?? '').trim(),
				password: String(form.get('password') ?? '')
			});
			window.location.assign(safeRedirect());
		} catch (error) {
			loginError =
				error instanceof ClientApiError ? error.message : 'No se pudo contactar con el servidor';
			loading = false;
		}
	}
</script>

<svelte:head><title>Entrar · OurSongs</title></svelte:head>

<div class="auth-wrap">
	<main class="auth-sheet">
		<section class="identity" aria-label="OurSongs">
			<div class="brand-mark"><Icon name="music" size={22} /></div>
			<p class="eyebrow">Nuestro repertorio</p>
			<h1>Las canciones,<br />siempre a mano.</h1>
			<p class="identity-copy">
				Letras y acordes en un único sitio, con la transposición a un clic para cuando la tonalidad
				no acompaña.
			</p>
		</section>

		<section class="sign-in">
			<p class="eyebrow">Acceso</p>
			<h2>Entrar</h2>
			<p class="auth-sub muted">Usa tu cuenta de OurSongs.</p>

			<form onsubmit={submit}>
				<label class="label" for="username">Usuario</label>
				<input
					id="username"
					name="username"
					type="text"
					autocomplete="username"
					autocapitalize="none"
					autocorrect="off"
					spellcheck="false"
					placeholder="usuario"
					class="input field"
					required
				/>

				<label class="label" for="password">Contraseña</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					placeholder="••••••••"
					class="input field"
					required
				/>

				{#if loginError}<p class="error-text">{loginError}</p>{/if}

				<button type="submit" class="btn btn-primary auth-btn" disabled={loading}>
					{#if loading}Entrando…{:else}<Icon name="lock" size={16} /> Entrar{/if}
				</button>
			</form>
		</section>
	</main>
</div>

<style>
	.auth-wrap {
		display: grid;
		min-height: 100dvh;
		place-items: center;
		padding: 1.25rem;
	}
	.auth-sheet {
		display: grid;
		width: 100%;
		max-width: 56rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
	}
	.identity,
	.sign-in {
		padding: clamp(2rem, 6vw, 4rem);
	}
	.identity {
		position: relative;
		display: flex;
		min-height: 30rem;
		flex-direction: column;
		justify-content: flex-end;
		border-right: 1px solid var(--color-border);
		background: var(--color-bg);
	}
	.identity::before {
		position: absolute;
		inset: 0 auto 0 0;
		width: 0.25rem;
		background: var(--color-text);
		content: '';
	}
	.brand-mark {
		position: absolute;
		top: clamp(2rem, 6vw, 4rem);
		left: clamp(2rem, 6vw, 4rem);
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-control);
		color: var(--color-bright);
	}
	.eyebrow {
		margin: 0 0 0.75rem;
		color: var(--color-subtle);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.identity h1 {
		margin: 0;
		font-size: clamp(2.2rem, 6vw, 3.4rem);
		font-weight: 700;
		line-height: 1.02;
	}
	.identity-copy {
		max-width: 26rem;
		margin: 1.25rem 0 0;
		color: var(--color-muted);
	}
	.sign-in {
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.sign-in h2 {
		margin: 0;
		font-size: 2.25rem;
		line-height: 1;
	}
	.auth-sub {
		margin: 0.45rem 0 0;
		font-size: 0.9rem;
	}
	form {
		width: 100%;
		margin-top: 2rem;
		text-align: left;
	}
	.field {
		margin-bottom: 0.9rem;
	}
	.auth-btn {
		width: 100%;
		margin-top: 1rem;
		padding: 0.8rem;
	}
	@media (min-width: 720px) {
		.auth-sheet {
			grid-template-columns: 1.1fr 0.9fr;
		}
	}
	@media (max-width: 719px) {
		.auth-wrap {
			place-items: stretch;
			padding: 0;
		}
		.auth-sheet {
			min-height: 100dvh;
			border: 0;
		}
		.identity {
			min-height: 14rem;
			padding: 5.5rem 1.5rem 1.75rem;
			border-right: 0;
			border-bottom: 1px solid var(--color-border);
		}
		.brand-mark {
			top: 1.5rem;
			left: 1.5rem;
		}
		.identity h1 {
			font-size: 2.35rem;
		}
		.identity-copy {
			display: none;
		}
		.sign-in {
			padding: 2.5rem 1.5rem;
		}
	}
</style>
