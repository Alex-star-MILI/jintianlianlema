import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '../components/ui/Toast'
import { AppRoutes } from './router'

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  )
}
