/**
 * La fecha se formatea en el servidor y no en el navegador: si cada lado la
 * formateara en su zona, el HTML del servidor y el del cliente no coincidirían.
 * La zona sale de la variable TZ del servidor. La copia sin conexión guarda la
 * etiqueta ya hecha por el mismo motivo.
 */
const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' });

export function formatUpdatedAt(iso: string): string {
	return dateFormat.format(new Date(iso));
}
