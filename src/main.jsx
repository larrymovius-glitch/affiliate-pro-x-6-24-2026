import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Dark unless the user picked light, so the first paint matches App.jsx
document.documentElement.classList.toggle('dark', localStorage.getItem('affiliateProThemeMode') !== 'light');

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)