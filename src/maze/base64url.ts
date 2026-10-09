/**
 * Base64url without padding (RFC 4648, section 5), the alphabet of the compact maze code, safe in
 * a URL as it is.
 *
 * @module
 */

const ALPHABET = /^[A-Za-z0-9_-]*$/;

/** The bytes in base64url, with no `=` padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** The bytes of base64url text with no padding, or `undefined` when it is not such text. */
export function fromBase64Url(text: string): Uint8Array | undefined {
  if (!ALPHABET.test(text) || text.length % 4 === 1) {
    return undefined;
  }

  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
