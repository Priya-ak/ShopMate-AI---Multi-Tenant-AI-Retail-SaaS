import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { InventoryItem, InventoryMovement } from '../types';
import { BackButton } from '../components/BackButton';
import {
  Boxes,
  TrendingDown,
  AlertTriangle,
  History,
  Plus,
  Minus,
  CheckCircle,
  AlertCircle,
  X,
  RefreshCw,
  Search,
} from 'lucide-react';

interface InventoryPageProps {
  onBack?: () => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'variants' | 'movements'>('variants');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Stock Adjustment Modal
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'ADD' | 'SUBTRACT' | 'SET'>('ADD');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'variants') {
        const inv = await api.getInventory();
        setInventory(inv);
      } else {
        const movs = await api.getInventoryMovements();
        setMovements(movs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdjust = (item: InventoryItem) => {
    setSelectedItem(item);
    setAdjustQty('');
    setAdjustType('ADD');
    setAdjustNotes('');
    setModalError(null);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !adjustQty) return;

    setModalError(null);
    setIsSubmitting(true);
    try {
      const qty = parseInt(adjustQty);
      if (isNaN(qty) || qty < 0) {
        setModalError('Please enter a valid quantity.');
        setIsSubmitting(false);
        return;
      }

      let payload: any = { notes: adjustNotes || 'Manual stock update from Inventory dashboard' };
      if (adjustType === 'SET') {
        payload.new_stock_qty = qty;
      } else if (adjustType === 'ADD') {
        payload.adjustment_qty = qty;
      } else if (adjustType === 'SUBTRACT') {
        if (selectedItem.stock_quantity - qty < 0) {
          setModalError(`Cannot reduce below 0. Current stock is ${selectedItem.stock_quantity}.`);
          setIsSubmitting(false);
          return;
        }
        payload.adjustment_qty = -qty;
      }

      await api.updateInventory(selectedItem.id, payload);
      setSelectedItem(null);
      loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to adjust stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.product_name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.colour.toLowerCase().includes(search.toLowerCase()) ||
      item.size.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filterType === 'LOW') return item.isLowStock && !item.isOutOfStock;
    if (filterType === 'OUT') return item.isOutOfStock;
    return true;
  });

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-indigo-400" />
            <span>Variant-Aware Inventory & Movement Ledger</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track individual size/colour quantities and audit every stock adjustment with transactional safety.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('variants')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'variants'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Variant Stock Matrix
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'movements'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Audit Movement Ledger
          </button>
        </div>
      </div>

      {activeTab === 'variants' ? (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search variant, size, or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  filterType === 'ALL'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Variants ({inventory.length})
              </button>
              <button
                onClick={() => setFilterType('LOW')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  filterType === 'LOW'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                Low Stock ({inventory.filter((i) => i.isLowStock && !i.isOutOfStock).length})
              </button>
              <button
                onClick={() => setFilterType('OUT')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  filterType === 'OUT'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'text-slate-400 hover:text-rose-300'
                }`}
              >
                Out of Stock ({inventory.filter((i) => i.isOutOfStock).length})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                    <th className="py-3 px-4">Product & Category</th>
                    <th className="py-3 px-3">Variant SKU</th>
                    <th className="py-3 px-3">Size</th>
                    <th className="py-3 px-3">Colour</th>
                    <th className="py-3 px-3">Unit Price</th>
                    <th className="py-3 px-3">Live Stock</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Quick Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400">
                        Loading inventory matrix...
                      </td>
                    </tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-500">
                        No inventory items matching this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{item.product_name}</div>
                          <div className="text-[10px] text-slate-400">{item.category_name || 'Retail'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-indigo-300">{item.sku}</td>
                        <td className="py-3 px-3 font-semibold text-slate-200">{item.size}</td>
                        <td className="py-3 px-3 text-slate-300">{item.colour}</td>
                        <td className="py-3 px-3 font-bold text-white">
                          ₹{(item.discount_price || item.price).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-black text-sm">
                          <span
                            className={
                              item.isOutOfStock
                                ? 'text-rose-400'
                                : item.isLowStock
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }
                          >
                            {item.stock_quantity}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {item.isOutOfStock ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800">
                              OUT OF STOCK
                            </span>
                          ) : item.isLowStock ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                              LOW STOCK (&le;{item.min_stock_threshold})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              OPTIMAL
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenAdjust(item)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                          >
                            Adjust
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Movements Audit Ledger */
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3">Variant (Size/Col)</th>
                  <th className="py-3 px-3">Action Type</th>
                  <th className="py-3 px-3 text-center">Change Qty</th>
                  <th className="py-3 px-3 text-center">Balance After</th>
                  <th className="py-3 px-3">Order / Reference</th>
                  <th className="py-3 px-4">Audit Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      Loading inventory ledger movements...
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      No ledger transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {m.created_at?.slice(0, 16)}
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">{m.product_name}</td>
                      <td className="py-3 px-3 text-slate-300">
                        {m.size} / {m.colour}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.movement_type === 'PURCHASE'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : m.movement_type === 'SALE'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : m.movement_type === 'CANCELLATION' || m.movement_type === 'RETURN'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-purple-950 text-purple-300 border border-purple-800'
                          }`}
                        >
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold">
                        <span className={m.change_qty > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {m.change_qty > 0 ? `+${m.change_qty}` : m.change_qty}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-white">
                        {m.balance_after}
                      </td>
                      <td className="py-3 px-3 font-mono text-indigo-400">
                        {m.reference_order_id || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px] truncate max-w-xs">
                        {m.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-base text-white">Adjust Variant Stock</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedItem.product_name} ({selectedItem.size} / {selectedItem.colour})
                </p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs">
              <span className="text-slate-400">Current Stock Balance:</span>
              <span className="font-bold text-base text-emerald-400">{selectedItem.stock_quantity} pieces</span>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Adjustment Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ADD', label: '+ Add Stock' },
                    { id: 'SUBTRACT', label: '- Deduct Stock' },
                    { id: 'SET', label: '= Set Exact' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAdjustType(t.id as any)}
                      className={`py-2 rounded-lg font-semibold border transition ${
                        adjustType === t.id
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Quantity *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Audit Ledger Reason / Notes</label>
                <input
                  type="text"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="e.g. Vendor stock arrival, physical count sync, damaged piece"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/20"
                >
                  {isSubmitting ? 'Recording...' : 'Record In Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
