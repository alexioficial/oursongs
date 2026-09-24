import { json, type RequestHandler } from '@sveltejs/kit';

/**
 * Liveness para el healthcheck de Coolify. No consulta MongoDB a propósito: si
 * la base tiene un hipo, lo que se quiere es un error en pantalla, no que el
 * orquestador tumbe y reinicie un contenedor que está perfectamente vivo.
 */
export const GET: RequestHandler = () => json({ ok: true });
