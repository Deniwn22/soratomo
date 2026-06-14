import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode removed for production: it double-invokes state updaters which
// interferes with the side-effect pattern used in recordCatch (result variable).
createRoot(document.getElementById('root')).render(<App />)
