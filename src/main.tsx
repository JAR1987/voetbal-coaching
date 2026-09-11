import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import {
  authService,
  teamService,
  spelerService,
  seizoenService,
  wedstrijdService,
  aanwezigheidService,
  opstellingService,
  statistiekenService,
} from './data'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      authService={authService}
      teamService={teamService}
      spelerService={spelerService}
      seizoenService={seizoenService}
      wedstrijdService={wedstrijdService}
      aanwezigheidService={aanwezigheidService}
      opstellingService={opstellingService}
      statistiekenService={statistiekenService}
    />
  </StrictMode>,
)
