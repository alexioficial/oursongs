<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		busy?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}
	let {
		open,
		title,
		message,
		confirmLabel = 'Eliminar',
		busy = false,
		onConfirm,
		onCancel
	}: Props = $props();

	function showModal(node: HTMLDialogElement) {
		if (!node.open) node.showModal();
		return {
			destroy() {
				if (node.open) node.close();
			}
		};
	}

	function cancel() {
		if (!busy) onCancel();
	}
</script>

{#if open}
	<dialog
		use:showModal
		class="confirm-dialog"
		aria-labelledby="confirm-dialog-title"
		aria-describedby="confirm-dialog-message"
		oncancel={(event) => {
			event.preventDefault();
			cancel();
		}}
		onclick={(event) => {
			if (event.target === event.currentTarget) cancel();
		}}
	>
		<div class="dialog-card">
			<div class="dialog-icon"><Icon name="trash" size={20} /></div>
			<div class="dialog-copy">
				<h2 id="confirm-dialog-title">{title}</h2>
				<p id="confirm-dialog-message">{message}</p>
			</div>
			<div class="dialog-actions">
				<button type="button" class="btn btn-subtle" disabled={busy} onclick={cancel}>
					Cancelar
				</button>
				<button type="button" class="btn btn-danger" disabled={busy} onclick={onConfirm}>
					{#if busy}Eliminando…{:else}<Icon name="trash" size={15} /> {confirmLabel}{/if}
				</button>
			</div>
		</div>
	</dialog>
{/if}

<style>
	.confirm-dialog {
		/* El reset de Tailwind quita el `margin: auto` con el que el navegador centra el <dialog>. */
		margin: auto;
		width: min(28rem, calc(100vw - 2rem));
		max-width: none;
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		background: transparent;
		color: var(--color-text);
		overflow: visible;
	}
	.confirm-dialog::backdrop {
		background: var(--color-backdrop);
		backdrop-filter: blur(3px);
	}
	.dialog-card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		padding: 1.25rem;
		border: 1px solid var(--color-border);
		border-top: 3px solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-surface-2);
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
	}
	.dialog-icon {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		color: var(--color-bright);
	}
	.dialog-copy {
		min-width: 0;
	}
	h2 {
		margin: 0 0 0.375rem;
		font-size: 1.2rem;
		font-weight: 600;
	}
	p {
		margin: 0;
		color: var(--color-subtle);
		font-size: 0.88rem;
		line-height: 1.45;
		word-break: break-word;
	}
	.dialog-actions {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
		gap: 0.55rem;
		margin-top: 0.5rem;
	}
	@media (max-width: 420px) {
		.dialog-actions {
			flex-direction: column-reverse;
		}
		.dialog-actions .btn {
			width: 100%;
		}
	}
</style>
