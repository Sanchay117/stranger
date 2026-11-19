import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Bench from './Bench.jsx'
import '../src/styles.css'
import './bench.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
)
