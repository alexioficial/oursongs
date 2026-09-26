<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		title: string;
		onClose: () => void;
		children: Snippet;
	}
	let { title, onClose, children }: Props = $props();

	function showModal(node: HTMLDialogElement) {
		if (!node.open) node.showModal();
		return {
			destroy() {
				if (node.open) node.close();
			}
		};
	}
</script>

<dialog
	use:showModal
	class="modal"
	aria-labelledby="modal-title"
	oncancel={(event) => {
		event.preventDefault();
		onClose();
	}}
	onclick={(event) => {
		// Clic en el fondo (nunca en la tarjeta) para cerrar.
		if (event.target === event.currentTarget) onClose();
	}}
>
	<div class="modal-card">
		<header class="modal-head">
			<h2 id="modal-title">{title}</h2>
			<button type="button" class="icon-btn" aria-label="Cerrar" onclick={onClose}>
				<Icon name="x" size={18} />
			</button>
		</header>
		<div class="modal-body">{@render children()}</div>
	</div>
</dialog>

<style>
	.modal {
		/* El reset de Tailwind quita el `margin: auto` con el que el navegador centra el <dialog>. */
		margin: auto;
		width: min(42rem, calc(100vw - 2rem));
		max-width: none;
		max-height: calc(100dvh - 2rem);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-text);
	}
	.modal::backdrop {
		background: var(--color-backdrop);
		backdrop-filter: blur(3px);
	}
	.modal-card {
		display: flex;
		max-height: calc(100dvh - 2rem);
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-surface);
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
	}
	.modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 0.75rem 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}
	.modal-body {
		padding: 1.25rem;
		overflow-y: auto;
	}
	@media (max-width: 640px) {
		.modal {
			width: 100vw;
			max-height: 100dvh;
			margin: 0;
		}
		.modal-card {
			height: 100dvh;
			max-height: 100dvh;
			border: 0;
			border-radius: 0;
		}
	}
</style>
