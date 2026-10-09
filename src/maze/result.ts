/**
 * The outcome of an operation that can be refused for a reason the caller shows, such as reading
 * a file or a link, without throwing.
 *
 * @module
 */

/** Either the value the operation produced or the reason it refused. */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** A successful result. */
export function success<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

/** A refused result. */
export function failure<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}
