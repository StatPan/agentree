import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { useAgentStore } from './store/agentStore'

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__agentStore = useAgentStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
