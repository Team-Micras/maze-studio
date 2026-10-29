/**
 * The library: the repository's mazes (the built-in snapshot and its updates from GitHub), the
 * user's own mazes, their backup, the catalog the screens list, and what the browser keeps.
 *
 * @module
 */

export {
  BACKUP_INDEX,
  exportMine,
  oversizedImport,
  readImport,
  type ExportResult,
  type ImportFile,
  type ImportReport,
  type SkippedExport,
  type SkippedImport,
} from './backup';
export { gitBlobSha } from './blob-sha';
export { folderCatalog, mineCatalog, repoCatalog, type CatalogEntry } from './catalog';
export {
  folderFileOf,
  keyOf,
  kindOf,
  mineKey,
  looseKey,
  mineIdOf,
  refOf,
  type MazeRef,
} from './maze-key';
export {
  folderPermission,
  isFolderHandle,
  readFolder,
  readFolderFile,
  writeFolderFile,
  type FolderContents,
  type FolderFile,
  type FolderHandle,
} from './folder';
export {
  Database,
  DATABASE_NAME,
  openDatabase,
  type ReadableRecords,
  type SkippedRecord,
  type StoreName,
  type StoreWriter,
} from './database';
export { fileStem, uniqueName, uniqueStems } from './file-names';
export {
  isUpdateDue,
  UPDATE_INTERVAL_MS,
  updateFromGitHub,
  type Fetch,
  type RepoState,
  type SkippedFile,
  type UpdateFailure,
  type UpdateResult,
} from './github-updater';
export {
  DEFAULT_FILTER,
  filterCatalog,
  isLibraryCategory,
  isLibrarySource,
  LIBRARY_CATEGORIES,
  LIBRARY_SOURCES,
  type LibraryCategory,
  type LibraryFilter,
  type LibrarySource,
} from './library-filter';
export { mazeOrigin, type MazeOrigin } from './maze-names';
export { MAZEFILES, type MazeRepository } from './mazefiles';
export {
  isMineRecipe,
  MINE_CHANNEL,
  mineContent,
  MineLibrary,
  type MineChanges,
  type MineDraft,
  type MineMaze,
  type MineOptions,
  type MineOrigin,
  type MineRead,
  type MineRecipe,
  type NoticeChannel,
  type Persistence,
  type PersistentStorage,
  type SaveConflict,
  type UnreadableMine,
} from './mine';
export {
  RepoCache,
  type CheckResult,
  type RepoCacheOptions,
  type RepoCopy,
  type RepoMeta,
} from './repo-cache';
export { matchesTokens, queryTokens, SearchIndex, searchWords, type SearchWords } from './search';
export { Settings, type SavedGenerator } from './settings';
export { loadSnapshot, readSnapshot, type RepoFile, type Snapshot } from './snapshot';
export { crc32, readZip, writeZip, type ZipEntry } from './zip';
