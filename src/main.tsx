import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/ui/app';
import { offerReload } from '@/ui/new-version';
import '@/ui/styles.css';
import { registerSW } from 'virtual:pwa-register';

const root = document.getElementById('root');

if (!root) {
  throw new Error('index.html has no #root element to mount maze-studio in');
}

if (import.meta.env.PROD) {
  const update = registerSW({
    onNeedRefresh: () => offerReload(() => void update(true)),
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
