import { MAZEFILES } from '@/library/mazefiles';

/** The whole app: for now, its name and the credit to the mazes it is built on. */
export function App() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <main className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">maze-studio</h1>
        <p className="text-muted-foreground">A library, viewer and editor of micromouse mazes.</p>
      </main>
      <footer className="text-sm text-muted-foreground">
        Mazes from{' '}
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href={MAZEFILES.url}
          rel="noreferrer"
          target="_blank"
        >
          {MAZEFILES.owner}/{MAZEFILES.name}
        </a>
      </footer>
    </div>
  );
}
