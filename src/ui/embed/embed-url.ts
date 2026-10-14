/**
 * The embed's address: `?embed` in the query turns the page into the embed, which shows one maze
 * and nothing else, for a page of another site to frame; the key is read like `?theme=`.
 *
 * @module
 */

/** The query key that turns the embed on, by its presence alone. */
export const EMBED_KEY = 'embed';

/** Whether the query `search` asks for the embed. */
export function isEmbed(search: string): boolean {
  return new URLSearchParams(search).has(EMBED_KEY);
}

/**
 * The address of what the embed at `href` shows, in the whole app: the same origin, path and hash,
 * without the embed's key; the other keys, such as `theme`, stay.
 */
export function appHref(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(EMBED_KEY);
  return url.href;
}
