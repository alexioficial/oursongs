import { setupOffline } from '$lib/offline/support';

// Antes de pintar nada: el modo sin conexión solo existe en https y fuera de localhost.
setupOffline();
