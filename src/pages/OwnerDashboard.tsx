import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { BackButton } from '../components/BackButton';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Package,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Sparkles,
  Calendar,
  Filter,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface OwnerDashboardProps {
  setCurrentView: (view: string) => void;
  onSelectOrder?: (order: Order) => void;
  onBack?: () => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({ setCurrentView, onSelectOrder, onBack }) => {
  const { business } = useAuth();
  const [data, setData] = useState<any>(null);
  const [salesData, setSalesData] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState('30d');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [dateFilter, business]);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const [overview, sales] = await Promise.all([
        api.getAnalyticsOverview(),
        api.getSalesAnalytics(),
      ]);
      setData(overview);
      setSalesData(sales);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const metrics = data?.metrics || {
    totalRevenue: 0,
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalCustomers: 0,
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };

  return (
    <div className="space-y-6">

      {/* Top Banner with Store Greeting & Date Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {business ? business.name : 'Store Management'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800">
              Active Store
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time multi-tenant retail analytics & verified inventory ledger.
          </p>
        </div>

        {/* Date Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'today', label: 'Today' },
            { id: '7d', label: 'Last 7 Days' },
            { id: '30d', label: 'Last 30 Days' },
            { id: '90d', label: 'Last 90 Days' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                dateFilter === f.id
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            ₹{metrics.totalRevenue.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Excludes cancelled orders</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Orders Count</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-950 text-indigo-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">{metrics.totalOrders}</div>
          <div className="text-[11px] text-slate-400">
            <strong className="text-amber-400">{metrics.pendingOrders} pending</strong> • {metrics.completedOrders} delivered
          </div>
        </div>

        {/* Total Customers */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Verified Customers</span>
            <div className="w-8 h-8 rounded-lg bg-purple-950 text-purple-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">{metrics.totalCustomers}</div>
          <div className="text-[11px] text-slate-400">Unique registered & guest profiles</div>
        </div>

        {/* Inventory Stock Alerts */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Inventory Alerts</span>
            <div className="w-8 h-8 rounded-lg bg-rose-950 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            {metrics.lowStockCount + metrics.outOfStockCount}
          </div>
          <div className="text-[11px] text-rose-400">
            {metrics.lowStockCount} low stock • {metrics.outOfStockCount} out of stock
          </div>
        </div>
      </div>

      {/* Charts & Quick Action Center */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sales Trends Chart (Visual Pure HTML/Tailwind) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-white">Daily Revenue Trend</h2>
              <p className="text-xs text-slate-400">Calculated from verified database orders</p>
            </div>
            <button
              onClick={() => setCurrentView('analytics')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              <span>Full Analytics</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Dynamic Bar visualization */}
          <div className="pt-6 space-y-2">
            {salesData?.dailySales && salesData.dailySales.length > 0 ? (
              <div className="h-44 flex items-end gap-3 sm:gap-6 pt-4 border-b border-slate-800 pb-2">
                {salesData.dailySales.map((item: any, idx: number) => {
                  const maxRev = Math.max(...salesData.dailySales.map((s: any) => s.revenue || 1));
                  const heightPercent = Math.max(15, Math.round((item.revenue / maxRev) * 100));
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition">
                        ₹{item.revenue.toLocaleString()}
                      </div>
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className="w-full bg-gradient-to-t from-indigo-600 to-violet-500 rounded-t-lg group-hover:from-indigo-500 group-hover:to-violet-400 transition"
                      />
                      <span className="text-[10px] text-slate-500 truncate w-full text-center">
                        {item.date ? item.date.slice(5) : 'Day'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                No orders recorded in this date range yet.
              </div>
            )}
          </div>
        </div>

        {/* Best-Selling Products */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-white">Top Performing Products</h2>
            <button
              onClick={() => setCurrentView('products')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Catalogue
            </button>
          </div>

          <div className="space-y-3">
            {data?.bestSellers && data.bestSellers.length > 0 ? (
              data.bestSellers.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-between text-xs"
                >
                  <div className="overflow-hidden pr-2">
                    <div className="font-semibold text-white truncate">{item.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{item.sku}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-indigo-300">{item.units_sold} sold</div>
                    <div className="text-[10px] text-slate-400">₹{item.revenue.toLocaleString()}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">
                No sales units recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-white">Recent Orders</h2>
            <p className="text-xs text-slate-400">Latest transactions with inventory movements</p>
          </div>
          <button
            onClick={() => setCurrentView('orders')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            View All Orders
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                <th className="py-3 px-3">Order #</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Total Amount</th>
                <th className="py-3 px-3">Payment</th>
                <th className="py-3 px-3">Order Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data?.recentOrders && data.recentOrders.length > 0 ? (
                data.recentOrders.map((ord: Order) => (
                  <tr key={ord.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3 font-mono font-bold text-indigo-400">{ord.order_number}</td>
                    <td className="py-3 px-3 text-slate-200 font-medium">{ord.customer_name}</td>
                    <td className="py-3 px-3 text-slate-400">{ord.order_date?.slice(0, 16)}</td>
                    <td className="py-3 px-3 font-bold text-white">₹{ord.total_amount.toLocaleString()}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          ord.payment_status === 'Paid'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {ord.payment_status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {ord.order_status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => {
                          if (onSelectOrder) onSelectOrder(ord);
                          setCurrentView('orders');
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-500">
                    No recent orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
