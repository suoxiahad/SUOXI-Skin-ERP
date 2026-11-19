// Ensure window.fetch is writable for browser test harnesses and extensions
try {
  const origFetch = window.fetch;
  let activeFetch = origFetch;
  Object.defineProperty(window, 'fetch', {
    get: () => activeFetch,
    set: (fn) => {
      activeFetch = fn;
    },
    configurable: true,
    enumerable: true,
  });
} catch (_) {}

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
