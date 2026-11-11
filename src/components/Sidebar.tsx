import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Package,
  Layers,
  Boxes,
  Users,
  ShoppingBag,
  Sparkles,
  MessageSquare,
  UserCheck,
  BarChart3,
  Share2,
  Settings,
  LogOut,
  Building2,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const { user, business, logout } = useAuth();

  const isOwner = user?.role === 'BUSINESS_OWNER';
  const isEmployee = user?.role === 'EMPLOYEE';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['BUSINESS_OWNER'] },
    { id: 'employee_dashboard', label: 'Staff Portal', icon: LayoutDashboard, roles: ['EMPLOYEE'] },
    { id: 'products', label: 'Products', icon: Package, roles: ['BUSINESS_OWNER', 'EMPLOYEE'] },
    { id: 'categories', label: 'Categories', icon: Layers, roles: ['BUSINESS_OWNER'] },
    { id: 'inventory', label: 'Inventory & Ledger', icon: Boxes, roles: ['BUSINESS_OWNER', 'EMPLOYEE'] },
    { id: 'orders', label: 'Orders', icon: ShoppingBag, roles: ['BUSINESS_OWNER', 'EMPLOYEE'] },
    { id: 'customers', label: 'Customers', icon: Users, roles: ['BUSINESS_OWNER', 'EMPLOYEE'] },
    { id: 'conversations', label: 'Conversations & AI', icon: MessageSquare, roles: ['BUSINESS_OWNER', 'EMPLOYEE'] },
    { id: 'shopping', label: 'AI Shopping Assistant', icon: Sparkles, roles: ['BUSINESS_OWNER', 'EMPLOYEE', 'CUSTOMER'] },
    { id: 'employees', label: 'Employees', icon: UserCheck, roles: ['BUSINESS_OWNER'] },
    { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3, roles: ['BUSINESS_OWNER'] },
    { id: 'integrations', label: 'WhatsApp & APIs', icon: Share2, roles: ['BUSINESS_OWNER'] },
    { id: 'settings', label: 'Store Settings', icon: Settings, roles: ['BUSINESS_OWNER'] },
  ];

  const allowedItems = menuItems.filter((item) =>
    item.roles.some((r) => r === user?.role)
  );

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 min-h-[calc(100vh-4rem)]">
      <div>
        {/* Store Profile Card */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-700/60 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="overflow-hidden">
              <h2 className="font-semibold text-sm text-slate-100 truncate">
                {business ? business.name : 'ShopMate Platform'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {business ? business.category : 'Multi-Tenant Retail'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-200" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        <div className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40 text-xs">
          <div className="font-medium text-slate-200 truncate">{user?.name || 'Store Admin'}</div>
          <div className="text-[11px] text-slate-400 truncate">{user?.email}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[10px] font-semibold uppercase text-emerald-400">{user?.role}</span>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
