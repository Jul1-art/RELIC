/** Resolve application resources independently from the current page. */
export const APP_ROOT = new URL('../../', import.meta.url);
export const appURL = path => new URL(path, APP_ROOT);
