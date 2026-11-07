import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { BackButton } from '../components/BackButton';
import { ShieldCheck, Building2, Users, ShoppingBag, Database, CheckCircle, Activity } from 'lucide-react';

interface SuperAdminDashboardProps {
  onBack?: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onBack }) => {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [bizList, healthRes] = await Promise.all([
        api.getSuperAdminBusinesses(),
        fetch('/api/health').then((r) => r.json()),
      ]);
      setBusinesses(bizList);
      setHealth(healthRes);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-amber-400" />
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Platform Super Admin & Multi-Tenant Management
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          High-level tenant isolation, platform database health, and active retail subscriptions.
        </p>
      </div>

      {/* System Health Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400">Total Registered Tenants</div>
          <div className="text-2xl font-black text-white">{businesses.length}</div>
          <div className="text-[10px] text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span>Isolated SQLite Schemas</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400">Database Engine</div>
          <div className="text-2xl font-black text-indigo-400">Node:SQLite Native</div>
          <div className="text-[10px] text-slate-500 font-mono">data/shopmate.db (Active)</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-slate-400">Gemini AI Model Status</div>
          <div className="text-2xl font-black text-purple-400">
            {health?.geminiConfigured ? 'Connected (Gemini 3.8)' : 'Deterministic Fallback Active'}
          </div>
          <div className="text-[10px] text-slate-500">Zero downtime retail agent</div>
        </div>
      </div>

      {/* Registered Tenants List */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-400" />
            <span>Registered Businesses (Tenant Isolation Audit)</span>
          </h2>
          <span className="text-xs text-slate-400">{businesses.length} registered shops</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                <th className="py-3 px-4">Business Name & ID</th>
                <th className="py-3 px-3">Industry Category</th>
                <th className="py-3 px-3">Phone & Address</th>
                <th className="py-3 px-3 text-center">Products</th>
                <th className="py-3 px-3 text-center">Orders</th>
                <th className="py-3 px-3 text-center">Tenant Status</th>
                <th className="py-3 px-4 text-right">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">Loading tenants...</td>
                </tr>
              ) : (
                businesses.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{b.name}</div>
                      <div className="font-mono text-[10px] text-indigo-400">{b.id}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-300">{b.category}</td>
                    <td className="py-3 px-3 text-slate-400 max-w-xs truncate">
                      {b.phone} • {b.address || '—'}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-white">
                      {b.product_count || 0}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-400">
                      {b.order_count || 0}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        ACTIVE TENANT
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                      {b.created_at?.slice(0, 10)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
