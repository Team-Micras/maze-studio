import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { registersServiceWorker } from '@/preview';
import { isEmbed } from '@/ui/embed/embed-url';
import '@/ui/styles.css';
import { registerSW } from 'virtual:pwa-register';

const root = document.getElementById('root');

if (!root) {
  throw new Error('index.html has no #root element to mount maze-studio in');
}

// Any frame gets the embed: old frames without `?embed` still work, and no site can clickjack the editor.
const embed = isEmbed(window.location.search) || window.top !== window;

if (import.meta.env.PROD && !embed && registersServiceWorker(window.location.pathname)) {
  const update = registerSW({
    onNeedRefresh: () =>
      void import('@/ui/new-version').then(({ offerReload }) =>
        offerReload(() => void update(true))
      ),
  });
}

/** The embed alone, or the whole app; each loads in its own chunk, so the embed skips the editor. */
async function screen(): Promise<ReactNode> {
  if (embed) {
    const { Embed } = await import('@/ui/embed/embed');
    return <Embed />;
  }

  const { App } = await import('@/ui/app');
  return <App />;
}

screen().then(
  (content) => createRoot(root).render(<StrictMode>{content}</StrictMode>),
  (error: unknown) => {
    root.textContent = 'maze-studio did not load. Reload to try again';
    throw error;
  }
);
