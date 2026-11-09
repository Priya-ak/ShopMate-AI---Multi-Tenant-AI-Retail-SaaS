import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {SuperAdminPortal} from './pages/SuperAdminPortal.tsx';
import './index.css';

// The Super Admin portal is a separate screen at /superadmin (own sign-in, own session).
const isSuperAdminPortal = window.location.pathname.replace(/\/+$/, '') === '/superadmin';

createRoot(document.getElementById('root')!).render(isSuperAdminPortal ? <SuperAdminPortal /> : <App />);
