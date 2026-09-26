import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Rutas absolutas a /_app: sin conexión el service worker sirve la misma
			// carcasa (/app-shell) para cualquier URL, y con rutas relativas una
			// página como /canciones/abc buscaría /canciones/_app/... y no arrancaría.
			paths: { relative: false }
		})
	]
});
