import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { BackButton } from '../components/BackButton';
import { BarChart3, TrendingUp, Download, PieChart, Package, Calendar } from 'lucide-react';

interface AnalyticsPageProps {
  onBack?: () => void;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ onBack }) => {
  const [data, setData] = useState<any>(null);
  const [sales, setSales] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const [overview, salesReport] = await Promise.all([
        api.getAnalyticsOverview(),
        api.getSalesAnalytics(),
      ]);
      setData(overview);
      setSales(salesReport);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!sales?.dailySales) return;
    const csvRows = [
      ['Date', 'Orders Count', 'Total Revenue (INR)'],
      ...sales.dailySales.map((s: any) => [s.date, s.order_count, s.revenue]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shopmate_sales_analytics_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            <span>Retail Financial & Catalogue Analytics</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Calculated strictly from real database transactions, order records, and inventory ledgers.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>Export Analytics CSV</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Gross Revenue</span>
          <div className="text-2xl font-black text-emerald-400">
            ₹{(data?.metrics?.totalRevenue || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-500">From verified transactions</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Average Order Value</span>
          <div className="text-2xl font-black text-indigo-400">
            ₹
            {data?.metrics?.totalOrders
              ? Math.round(data.metrics.totalRevenue / data.metrics.totalOrders).toLocaleString()
              : 0}
          </div>
          <span className="text-[10px] text-slate-500">Per completed order</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Delivered Fulfillment Rate</span>
          <div className="text-2xl font-black text-white">
            {data?.metrics?.totalOrders
              ? Math.round(((data.metrics.completedOrders || 0) / data.metrics.totalOrders) * 100)
              : 0}
            %
          </div>
          <span className="text-[10px] text-slate-500">Successful customer handovers</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Inventory Health</span>
          <div className="text-2xl font-black text-white">
            {data?.metrics?.totalProducts
              ? Math.round(
                  ((data.metrics.totalProducts - (data.metrics.outOfStockCount || 0)) /
                    data.metrics.totalProducts) *
                    100
                )
              : 100}
            %
          </div>
          <span className="text-[10px] text-slate-500">Catalogue in-stock ratio</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Category Performance Breakdown */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-400" />
            <span>Category Revenue Contribution</span>
          </h2>

          <div className="space-y-3 pt-2">
            {sales?.categoryShare && sales.categoryShare.length > 0 ? (
              sales.categoryShare.map((cat: any, idx: number) => {
                const totalCatRev = sales.categoryShare.reduce((a: number, b: any) => a + (b.revenue || 0), 0) || 1;
                const percent = Math.round((cat.revenue / totalCatRev) * 100);
                return (
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-200">{cat.category}</span>
                      <span className="font-bold text-indigo-300">
                        ₹{cat.revenue.toLocaleString()} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${percent}%` }}
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs">
                No category sales recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Daily Sales Breakdown */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Daily Sales Breakdown</span>
          </h2>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {sales?.dailySales && sales.dailySales.length > 0 ? (
              sales.dailySales.map((day: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 font-mono text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{day.date}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-400">₹{day.revenue.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400">{day.order_count} order(s)</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs">No daily sales logs yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
