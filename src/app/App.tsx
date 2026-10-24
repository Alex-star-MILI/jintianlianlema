import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '../components/ui/Toast'
import { AppRoutes } from './router'

const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter basename={basename}>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  )
}
