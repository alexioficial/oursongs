// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SessionUser } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
		}
	}
}

export {};
