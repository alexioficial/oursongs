<script lang="ts">
	interface Props {
		name: string;
		size?: number;
		stroke?: number;
		class?: string;
	}
	let { name, size = 20, stroke = 2, class: cls = '' }: Props = $props();

	// Iconos tipo "lucide" (trazo, currentColor). Sin dependencias externas.
	const paths: Record<string, string> = {
		music:
			'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
		tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><path d="M7.5 7.5h.01"/>',
		lyrics: '<path d="M17 6H3M21 12H3M17 18H3"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',
		up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
		down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
		reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
		trash:
			'<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
		pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
		check: '<path d="M20 6 9 17l-5-5"/>',
		x: '<path d="M18 6 6 18M6 6l12 12"/>',
		search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
		back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
		chevron: '<path d="m9 18 6-6-6-6"/>',
		lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
		logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
		users:
			'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>'
	};

	const body = $derived(paths[name] ?? paths.music);
</script>

<svg
	class={cls}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	<!-- El contenido sale exclusivamente del mapa estático `paths` de arriba: nunca
	hay nada del usuario aquí, así que no hay superficie de XSS. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html body}</svg
>
