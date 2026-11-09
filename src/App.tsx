import React, { useState } from 'react';
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
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { CustomerShoppingPage } from './pages/CustomerShoppingPage';
import { AppAssistantPage } from './pages/AppAssistantPage';
import { Order } from './types';

function MainApp() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<string>('landing');
  const [history, setHistory] = useState<string[]>(['landing']);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);

  const navigateTo = (view: string) => {
    setHistory((prev) => (prev[prev.length - 1] === view ? prev : [...prev, view]));
    setCurrentView(view);
  };

  const goBack = () => {
    if (history.length > 1) {
      const nextHistory = [...history];
      nextHistory.pop(); // remove current view
      const prevView = nextHistory[nextHistory.length - 1];
      setHistory(nextHistory);
      setCurrentView(prevView);
    } else {
      // Fallback
      if (user?.role === 'EMPLOYEE') setCurrentView('employee_dashboard');
      else if (user?.role === 'SUPER_ADMIN') setCurrentView('super_admin');
      else if (user?.role === 'BUSINESS_OWNER') setCurrentView('dashboard');
      else setCurrentView('landing');
    }
  };

  // If user clicks "Details" from dashboard, open orders view with that order preselected
  const handleSelectOrder = (order: Order) => {
    setSelectedOrderForDetails(order);
    navigateTo('orders');
  };

  const isPublicPage = ['landing', 'login', 'register', 'forgot_password'].includes(currentView);
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
          {currentView === 'landing' && (
            <LandingPage
              onStartShopping={() => navigateTo('shopping')}
              onOpenLogin={() => navigateTo('login')}
              onOpenRegister={() => navigateTo('register')}
            />
          )}

          {currentView === 'login' && (
            <LoginPage
              onSuccess={(loggedInUser) => {
                const role = loggedInUser?.role || user?.role;
                if (role === 'CUSTOMER') navigateTo('shopping');
                else if (role === 'EMPLOYEE') navigateTo('employee_dashboard');
                else if (role === 'SUPER_ADMIN') navigateTo('super_admin');
                else navigateTo('dashboard');
              }}
              onGoToRegister={() => navigateTo('register')}
              onGoToForgotPassword={() => navigateTo('forgot_password')}
            />
          )}

          {currentView === 'register' && (
            <RegisterPage
              onSuccess={() => navigateTo('dashboard')}
              onGoToLogin={() => navigateTo('login')}
            />
          )}

          {currentView === 'forgot_password' && (
            <ForgotPasswordPage onBackToLogin={() => navigateTo('login')} />
          )}

          {currentView === 'shopping' && user && (
            <CustomerShoppingPage
              openCartDrawer={() => setIsCartOpen(true)}
              onBack={goBack}
            />
          )}

          {/* Signed-out visitors get the public ShopMate AI help assistant (no store, no cart) */}
          {currentView === 'shopping' && !user && (
            <AppAssistantPage
              onBack={goBack}
              onOpenLogin={() => navigateTo('login')}
              onOpenRegister={() => navigateTo('register')}
            />
          )}

          {currentView === 'dashboard' && (
            <OwnerDashboard
              setCurrentView={navigateTo}
              onSelectOrder={handleSelectOrder}
              onBack={goBack}
            />
          )}

          {currentView === 'employee_dashboard' && (
            <EmployeeDashboard
              setCurrentView={navigateTo}
              onSelectOrder={handleSelectOrder}
              onBack={goBack}
            />
          )}

          {currentView === 'products' && <ProductsPage onBack={goBack} />}

          {currentView === 'categories' && <CategoriesPage onBack={goBack} />}

          {currentView === 'inventory' && <InventoryPage onBack={goBack} />}

          {currentView === 'orders' && (
            <OrdersPage
              initialSelectedOrder={selectedOrderForDetails}
              onBack={goBack}
            />
          )}

          {currentView === 'customers' && <CustomersPage onBack={goBack} />}

          {currentView === 'conversations' && <ConversationsPage onBack={goBack} />}

          {currentView === 'employees' && <EmployeesPage onBack={goBack} />}

          {currentView === 'analytics' && <AnalyticsPage onBack={goBack} />}

          {currentView === 'integrations' && <IntegrationsPage onBack={goBack} />}

          {currentView === 'settings' && <SettingsPage onBack={goBack} />}

          {currentView === 'super_admin' && <SuperAdminDashboard onBack={goBack} />}
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
