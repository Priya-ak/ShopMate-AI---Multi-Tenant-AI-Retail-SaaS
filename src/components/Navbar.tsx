import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import {
  Store,
  ShoppingCart,
  User as UserIcon,
  LogOut,
  Sparkles,
  ShieldCheck,
  Building2,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  openCartDrawer?: () => void;
  onBack?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setCurrentView, openCartDrawer, onBack }) => {
  const { user, business, logout, currentBusinessId } = useAuth();
  const { totalCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // The public (signed-out) assistant is a help bot for the app itself - it has no store, so no cart.
  const showCart = !(currentView === 'shopping' && !user);

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Global Back */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentView('landing')}
              className="flex items-center gap-2.5 text-left group transition"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  ShopMate <span className="text-indigo-400">AI</span>
                </span>
                <span className="hidden sm:inline-block ml-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                  Retail SaaS
                </span>
              </div>
            </button>

            {/* Current Active Tenant Indicator */}
            {business && (
              <div className="hidden md:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-800 text-xs text-slate-300">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-medium text-slate-200">{business.name}</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                  {business.category || 'Active Store'}
                </span>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-2">

            {/* AI Shopping Simulator quick button */}
            <button
              onClick={() => setCurrentView('shopping')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentView === 'shopping'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>AI Shopping Assistant</span>
            </button>

            {/* Cart Trigger */}
            {showCart && (
              <button
                onClick={openCartDrawer}
                className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
                title="Shopping Cart"
              >
                <ShoppingCart className="w-4 h-4" />
                {totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-500 text-white font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                    {totalCount}
                  </span>
                )}
              </button>
            )}

            {/* Main Navigation or Auth */}
            {user ? (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-800">
                {user.role === 'BUSINESS_OWNER' && (
                  <button
                    onClick={() => setCurrentView('dashboard')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      currentView === 'dashboard' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    Dashboard
                  </button>
                )}
                {user.role === 'EMPLOYEE' && (
                  <button
                    onClick={() => setCurrentView('employee_dashboard')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      currentView === 'employee_dashboard' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    Staff Portal
                  </button>
                )}
                {user.role === 'SUPER_ADMIN' && (
                  <button
                    onClick={() => setCurrentView('super_admin')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      currentView === 'super_admin' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    Platform Admin
                  </button>
                )}
                <button
                  onClick={logout}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => setCurrentView('login')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setCurrentView('register')}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
                >
                  Register Business
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            {showCart && (
              <button
                onClick={openCartDrawer}
                className="relative p-2 rounded-lg text-slate-300 hover:text-white"
              >
                <ShoppingCart className="w-5 h-5" />
                {totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-500 text-white font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                    {totalCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 pt-2 pb-4 space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">Navigation</div>
          <button
            onClick={() => { setCurrentView('landing'); setMobileMenuOpen(false); }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800"
          >
            Public Website
          </button>
          <button
            onClick={() => { setCurrentView('shopping'); setMobileMenuOpen(false); }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-emerald-400 hover:bg-slate-800 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            AI Shopping Assistant
          </button>
          {user ? (
            <>
              {user.role === 'BUSINESS_OWNER' && (
                <button
                  onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800"
                >
                  Owner Dashboard
                </button>
              )}
              {user.role === 'EMPLOYEE' && (
                <button
                  onClick={() => { setCurrentView('employee_dashboard'); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800"
                >
                  Employee Portal
                </button>
              )}
              {user.role === 'SUPER_ADMIN' && (
                <button
                  onClick={() => { setCurrentView('super_admin'); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800"
                >
                  Platform Admin
                </button>
              )}
              <button
                onClick={() => { logout(); setMobileMenuOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-rose-400 hover:bg-slate-800"
              >
                Sign Out ({user.email})
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setCurrentView('login'); setMobileMenuOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800"
              >
                Sign In
              </button>
              <button
                onClick={() => { setCurrentView('register'); setMobileMenuOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-indigo-400 hover:bg-slate-800"
              >
                Register Business
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
