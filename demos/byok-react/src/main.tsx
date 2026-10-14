import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles.css'

// DEMO JANK: the boot line every Vite + React app has.
const rootElement = document.getElementById('root')
if (rootElement === null) { throw new Error('index.html lost its #root element') }
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
