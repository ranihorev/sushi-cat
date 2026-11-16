import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { surprises } from './game/surprises';

// in development only: a handle to ask for a joke by name, for tests and screenshots
if (import.meta.env.DEV) (window as any).__surprises = surprises;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
