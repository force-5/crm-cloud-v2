import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/lato/400.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/900.css';
import '@fontsource/bebas-neue/400.css';
import 'react-easy-crop/react-easy-crop.css';
import './styles.css';
import './lib/i18n';
import { AppProviders, createAppInstance } from './lib/app';

async function bootstrap() {
  // Optional in-browser mock backend for UI work without the BFF: VITE_MOCK_API=true pnpm dev
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true') {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  }
  const app = createAppInstance();
  const el = document.getElementById('root');
  if (!el) throw new Error('#root missing');
  createRoot(el).render(
    <StrictMode>
      <AppProviders app={app} />
    </StrictMode>,
  );
}

void bootstrap();
