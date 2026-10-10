/** What the Folder source's tooltip says: the folder's name, and the files it skipped. */
export function folderHint(folder: { readonly name: string; readonly skipped: number }): string {
  return folder.skipped === 0
    ? folder.name
    : `${folder.name}, ${folder.skipped} file${folder.skipped === 1 ? '' : 's'} skipped`;
}
