import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Order, Product, Conversation } from '../types';
import { BackButton } from '../components/BackButton';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  MessageSquare,
  CheckCircle2,
  Clock,
  Search,
  ExternalLink,
} from 'lucide-react';

interface EmployeeDashboardProps {
  setCurrentView: (view: string) => void;
  onSelectOrder?: (order: Order) => void;
  onBack?: () => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ setCurrentView, onSelectOrder, onBack }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStaffPortal();
  }, []);

  const loadStaffPortal = async () => {
    setIsLoading(true);
    try {
      const [ords, convs, prods] = await Promise.all([
        api.getOrders(),
        api.getConversations(),
        api.getProducts(),
      ]);
      setOrders(ords);
      setConversations(convs);
      setProducts(prods.products || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const pendingOrders = orders.filter((o) => ['Pending', 'Confirmed', 'Processing'].includes(o.order_status));
  const openEnquiries = conversations.filter((c) => ['New', 'Open', 'Waiting'].includes(c.status));

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(stockSearch.toLowerCase()) ||
      (p.colour && p.colour.toLowerCase().includes(stockSearch.toLowerCase()))
  );

  return (
    <div className="space-y-6">

      {/* Employee Greeting Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Staff Portal • Welcome, {user?.name || 'Staff Member'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-950 text-blue-300 border border-blue-800">
              Order Fulfillment Staff
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Access assigned customer enquiries, check live stock, and process packing and dispatch.
          </p>
        </div>

        <button
          onClick={() => setCurrentView('shopping')}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
        >
          <span>Open AI Shopping Simulator</span>
        </button>
      </div>

      {/* Staff KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Orders Needing Dispatch</span>
          <div className="text-2xl font-black text-amber-400">{pendingOrders.length}</div>
          <span className="text-[10px] text-slate-500">Confirmed / Processing queue</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Active Customer Chats</span>
          <div className="text-2xl font-black text-indigo-400">{openEnquiries.length}</div>
          <span className="text-[10px] text-slate-500">Customer enquiries in progress</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Delivered Orders</span>
          <div className="text-2xl font-black text-emerald-400">
            {orders.filter((o) => o.order_status === 'Delivered').length}
          </div>
          <span className="text-[10px] text-slate-500">Completed order handovers</span>
        </div>
      </div>

      {/* Two Column Layout: Orders Queue + Instant Stock Lookup */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Order Queue */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-400" />
              <span>Orders Queue</span>
            </h2>
            <button
              onClick={() => setCurrentView('orders')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              All Orders
            </button>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
            {pendingOrders.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">No pending orders.</div>
            ) : (
              pendingOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-400">{ord.order_number}</span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                        {ord.order_status}
                      </span>
                    </div>
                    <div className="font-semibold text-white">{ord.customer_name}</div>
                    <div className="text-[11px] text-slate-400">{ord.delivery_address}</div>
                  </div>

                  <div className="text-right space-y-2">
                    <div className="font-bold text-sm text-white">₹{ord.total_amount.toLocaleString()}</div>
                    <button
                      onClick={() => {
                        if (onSelectOrder) onSelectOrder(ord);
                        setCurrentView('orders');
                      }}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold"
                    >
                      Process & Pack
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instant Stock Checker for Phone / Walk-in Enquiries */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <span>Instant Floor Stock Lookup</span>
            </h2>
            <span className="text-[10px] text-slate-400">Variant-level live counts</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search product name or SKU..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {filteredProducts.slice(0, 8).map((p) => {
              const totalStock = (p.variants || []).reduce((acc, v) => acc + (v.stock_quantity || 0), 0);
              return (
                <div
                  key={p.id}
                  className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs space-y-1.5"
                >
                  <div className="flex justify-between items-start">
                    <div className="font-semibold text-white truncate max-w-[220px]">{p.name}</div>
                    <span
                      className={`font-bold text-xs ${
                        totalStock > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {totalStock} in stock
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(p.variants || []).map((v) => (
                      <span
                        key={v.id}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                          v.stock_quantity > 0
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-rose-950/60 text-rose-400 line-through'
                        }`}
                      >
                        {v.size}: {v.stock_quantity} pcs
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
