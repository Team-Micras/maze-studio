/** How long the download's object URL lives: revoked at once, the browser may not have read it. */
const REVOKE_AFTER_MS = 10_000;

/** Downloads `blob` as `fileName`, through a link the page clicks. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
