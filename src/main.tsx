import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { authService, teamService, spelerService, wedstrijdService, aanwezigheidService, opstellingService } from './data'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      authService={authService}
      teamService={teamService}
      spelerService={spelerService}
      wedstrijdService={wedstrijdService}
      aanwezigheidService={aanwezigheidService}
      opstellingService={opstellingService}
    />
  </StrictMode>,
)
