import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing: GitHub Pages has no rewrite rules, so a refresh on a
        deep path would 404 with a history router. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
)
