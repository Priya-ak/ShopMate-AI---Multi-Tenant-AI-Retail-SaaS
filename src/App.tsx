import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { CartDrawer } from './components/CartDrawer';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { OwnerDashboard } from './pages/OwnerDashboard';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { ProductsPage } from './pages/ProductsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { InventoryPage } from './pages/InventoryPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CustomerShoppingPage } from './pages/CustomerShoppingPage';
import { LegalPage } from './pages/LegalPages';
import { AppAssistantPage } from './pages/AppAssistantPage';
import { Order } from './types';

/**
 * Every screen has its own URL, so a refresh stays on the same page and the browser Back/Forward buttons work.
 * (vercel.json already serves index.html for all non-API paths. "/superadmin" is the separate admin portal.)
 */
const VIEW_PATHS: Record<string, string> = {
  landing: '/',
  login: '/login',
  register: '/register',
  forgot_password: '/forgot-password',
  shopping: '/shopping',
  dashboard: '/dashboard',
  employee_dashboard: '/staff',
  products: '/products',
  categories: '/categories',
  inventory: '/inventory',
  orders: '/orders',
  customers: '/customers',
  conversations: '/conversations',
  employees: '/employees',
  analytics: '/analytics',
  integrations: '/integrations',
  settings: '/settings',
  privacy: '/privacy',
  terms: '/terms',
  data_deletion: '/data-deletion',
};
const PATH_VIEWS: Record<string, string> = Object.fromEntries(Object.entries(VIEW_PATHS).map(([v, p]) => [p, v]));
const AUTH_SCREENS = ['login', 'register', 'forgot_password'];
const LEGAL_VIEWS = ['privacy', 'terms', 'data_deletion'];
const OPEN_VIEWS = ['landing', 'shopping', ...LEGAL_VIEWS, ...AUTH_SCREENS]; // everything else needs a signed-in user

const viewFromPath = (pathname: string) => PATH_VIEWS[pathname.replace(/\/+$/, '') || '/'] ?? 'landing';

const homeViewFor = (user: { role?: string } | null) => {
  if (!user) return 'landing';
  if (user.role === 'CUSTOMER') return 'shopping';
  if (user.role === 'EMPLOYEE') return 'employee_dashboard';
  return 'dashboard';
};

/** Where a visitor must be sent instead of `view` (null = the view is fine). */
function guardTarget(view: string, user: { role?: string } | null): string | null {
  if (!user) return OPEN_VIEWS.includes(view) ? null : 'login';
  if (AUTH_SCREENS.includes(view)) return homeViewFor(user);
  if (user.role === 'CUSTOMER') return OPEN_VIEWS.includes(view) ? null : 'shopping';
  if (view === 'dashboard' && user.role !== 'BUSINESS_OWNER') return homeViewFor(user);
  if (view === 'employee_dashboard' && user.role !== 'EMPLOYEE') return homeViewFor(user);
  return null;
}

function MainApp() {
  const { user, isLoading, logout } = useAuth();
  const [currentView, setCurrentView] = useState<string>(() => viewFromPath(window.location.pathname));
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const historyIndex = useRef(0); // position in this tab's navigation stack (0 = first page opened)
  const previousUser = useRef(user);

  useEffect(() => {
    const st = window.history.state;
    historyIndex.current = typeof st?.idx === 'number' ? st.idx : 0;
    window.history.replaceState({ idx: historyIndex.current }, '', window.location.pathname);
    const onPop = (e: PopStateEvent) => {
      historyIndex.current = typeof e.state?.idx === 'number' ? e.state.idx : 0;
      setCurrentView(viewFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigateTo = useCallback((view: string, opts?: { replace?: boolean }) => {
    const path = VIEW_PATHS[view] ?? '/';
    if (window.location.pathname !== path) {
      if (opts?.replace) {
        window.history.replaceState({ idx: historyIndex.current }, '', path);
      } else {
        historyIndex.current += 1;
        window.history.pushState({ idx: historyIndex.current }, '', path);
      }
    }
    setCurrentView(view);
    window.scrollTo(0, 0);
  }, []);

  const goBack = () => {
    if (historyIndex.current > 0) window.history.back();
    else navigateTo(homeViewFor(user), { replace: true });
  };

  // Logout / expired session -> back to the landing page. Otherwise keep visitors out of screens they may not open.
  useEffect(() => {
    if (isLoading) return;
    if (previousUser.current && !user) {
      previousUser.current = user;
      setIsCartOpen(false);
      setSelectedOrderForDetails(null);
      navigateTo('landing', { replace: true });
      return;
    }
    previousUser.current = user;
    // The platform admin has their own portal (own sign-in and session): never host them in the store app.
    if (user?.role === 'SUPER_ADMIN') {
      logout();
      window.location.replace('/superadmin');
      return;
    }
    const target = guardTarget(currentView, user);
    if (target && target !== currentView) navigateTo(target, { replace: true });
  }, [currentView, user, isLoading, navigateTo, logout]);

  // A private page is opened (e.g. after a refresh) while the saved session is still being checked.
  const checkingSession = isLoading && !OPEN_VIEWS.includes(currentView);
  const shownView = checkingSession ? '' : currentView;

  // If user clicks "Details" from dashboard, open orders view with that order preselected
  const handleSelectOrder = (order: Order) => {
    setSelectedOrderForDetails(order);
    navigateTo('orders');
  };

  const isPublicPage = ['landing', 'login', 'register', 'forgot_password', ...LEGAL_VIEWS].includes(currentView);
  const isShoppingAssistant = currentView === 'shopping';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={navigateTo}
        openCartDrawer={() => setIsCartOpen(true)}
        onBack={goBack}
      />

      {/* Main Layout Container */}
      <div className="flex-1 flex">
        {/* Render Sidebar only for authenticated workspace views (Owner, Staff, Admin) */}
        {!isPublicPage && !isShoppingAssistant && user && (
          <Sidebar currentView={currentView} setCurrentView={navigateTo} />
        )}

        {/* Dynamic Page Router */}
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {checkingSession && (
            <div className="min-h-[50vh] flex items-center justify-center text-slate-400 text-sm" role="status" aria-live="polite">
              <span className="w-5 h-5 mr-3 rounded-full border-2 border-slate-600 border-t-indigo-400 animate-spin" />
              Restoring your session...
            </div>
          )}
          {shownView === 'landing' && (
            <LandingPage
              onStartShopping={() => navigateTo('shopping')}
              onOpenLogin={() => navigateTo('login')}
              onOpenRegister={() => navigateTo('register')}
            />
          )}

          {shownView === 'login' && (
            <LoginPage
              onSuccess={(loggedInUser) => {
                const role = loggedInUser?.role || user?.role;
                if (role === 'CUSTOMER') navigateTo('shopping');
                else if (role === 'EMPLOYEE') navigateTo('employee_dashboard');
                else navigateTo('dashboard');
              }}
              onGoToRegister={() => navigateTo('register')}
              onGoToForgotPassword={() => navigateTo('forgot_password')}
            />
          )}

          {shownView === 'register' && (
            <RegisterPage
              onSuccess={() => navigateTo('dashboard')}
              onGoToLogin={() => navigateTo('login')}
            />
          )}

          {shownView === 'forgot_password' && (
            <ForgotPasswordPage onBackToLogin={() => navigateTo('login')} />
          )}

          {shownView === 'shopping' && user && (
            <CustomerShoppingPage
              openCartDrawer={() => setIsCartOpen(true)}
              onBack={goBack}
            />
          )}

          {/* Signed-out visitors get the public ShopMate AI help assistant (no store, no cart) */}
          {shownView === 'shopping' && !user && (
            <AppAssistantPage
              onBack={goBack}
              onOpenLogin={() => navigateTo('login')}
              onOpenRegister={() => navigateTo('register')}
            />
          )}

          {shownView === 'dashboard' && (
            <OwnerDashboard
              setCurrentView={navigateTo}
              onSelectOrder={handleSelectOrder}
              onBack={goBack}
            />
          )}

          {shownView === 'employee_dashboard' && (
            <EmployeeDashboard
              setCurrentView={navigateTo}
              onSelectOrder={handleSelectOrder}
              onBack={goBack}
            />
          )}

          {shownView === 'products' && <ProductsPage onBack={goBack} />}

          {shownView === 'categories' && <CategoriesPage onBack={goBack} />}

          {shownView === 'inventory' && <InventoryPage onBack={goBack} />}

          {shownView === 'orders' && (
            <OrdersPage
              initialSelectedOrder={selectedOrderForDetails}
              onBack={goBack}
            />
          )}

          {shownView === 'customers' && <CustomersPage onBack={goBack} />}

          {shownView === 'conversations' && <ConversationsPage onBack={goBack} />}

          {shownView === 'employees' && <EmployeesPage onBack={goBack} />}

          {shownView === 'analytics' && <AnalyticsPage onBack={goBack} />}

          {shownView === 'integrations' && <IntegrationsPage onBack={goBack} />}

          {shownView === 'settings' && <SettingsPage onBack={goBack} />}

          {(shownView === 'privacy' || shownView === 'terms' || shownView === 'data_deletion') && <LegalPage kind={shownView} />}

        </main>
      </div>

      {/* Global Shopping Cart & Checkout Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onOrderCompleted={(orderNum) => {
          // If in owner or staff view, reload
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <MainApp />
      </CartProvider>
    </AuthProvider>
  );
}
