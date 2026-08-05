// Render harness entry — bundled by verify/design_render.mjs and mounted in
// jsdom. Fixtures and assertions live in the runner; this file only mounts.
import { createRoot } from 'react-dom/client';
import App from '../src/App';

export function mountApp() {
  const container = document.getElementById('root') as HTMLElement;
  const root = createRoot(container);
  root.render(<App />);
  return root;
}
