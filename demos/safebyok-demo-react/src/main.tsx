import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { keepStorage } from './lib/persist-storage'
import './styles.css'

// The boot line every Vite + React app has.
const rootElement = document.querySelector('#root')
if (rootElement === null) { throw new Error('index.html lost its #root element') }
// The vault lives in this browser's IndexedDB, which the browser may evict unless asked not to.
void keepStorage()
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
