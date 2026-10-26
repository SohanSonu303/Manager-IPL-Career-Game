import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { startUpdateChecks } from './state/pwaUpdate'
import { loadSavedCareer } from './state/store'

loadSavedCareer()
startUpdateChecks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
