import { oversizedImport, type ImportFile, type SkippedImport } from '@/library';

/** The part of a picked `File` the import uses. */
export interface PickedImport {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** The files read for the import, and those refused unread for their size. */
export interface PickedImports {
  readonly files: readonly ImportFile[];
  readonly refused: readonly SkippedImport[];
}

/**
 * Reads the picked files for the import, refusing without reading any that `oversizedImport`
 * refuses, with the reason.
 */
export async function readPickedImports(picked: readonly PickedImport[]): Promise<PickedImports> {
  const refused: SkippedImport[] = [];
  const accepted: PickedImport[] = [];

  for (const file of picked) {
    const reason = oversizedImport(file.name, file.size);

    if (reason === undefined) {
      accepted.push(file);
    } else {
      refused.push({ name: file.name, message: reason });
    }
  }

  const files = await Promise.all(
    accepted.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }))
  );
  return { files, refused };
}
