/**
 * Where the mazes come from: the community repository of micromouse mazes that the library
 * mirrors, credited wherever its mazes appear.
 *
 * @module
 */

/** The upstream repository of mazes, on GitHub. */
export interface MazeRepository {
  /** The GitHub account that owns it. */
  readonly owner: string;
  /** Its name on GitHub. */
  readonly name: string;
  /** The branch the library follows. */
  readonly branch: string;
  /** Its page, for the credit. */
  readonly url: string;
}

/** micromouseonline/mazefiles, where every maze of the library comes from. */
export const MAZEFILES: MazeRepository = {
  owner: 'micromouseonline',
  name: 'mazefiles',
  branch: 'master',
  url: 'https://github.com/micromouseonline/mazefiles',
};
