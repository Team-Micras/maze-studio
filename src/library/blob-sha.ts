/**
 * The git blob SHA-1 of a file, the hash GitHub's tree lists for it, computed with Web Crypto so
 * it runs the same in the browser and in Bun.
 *
 * @module
 */

/** The git blob SHA-1 of `bytes`, in lowercase hex: SHA-1 of `blob <length>\0` and the bytes. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const object = new Uint8Array(header.length + bytes.length);
  object.set(header);
  object.set(bytes, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', object));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
