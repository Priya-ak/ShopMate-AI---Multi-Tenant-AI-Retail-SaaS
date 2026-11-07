import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Order, OrderStatus } from '../types';
import { InvoiceModal } from '../components/InvoiceModal';
import { BackButton } from '../components/BackButton';
import {
  ShoppingBag,
  Search,
  Filter,
  Download,
  Printer,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  Clock,
  AlertCircle,
  Eye,
  FileText,
} from 'lucide-react';

interface OrdersPageProps {
  initialSelectedOrder?: Order | null;
  onBack?: () => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ initialSelectedOrder, onBack }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Selected Order for Modal / Invoice
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<Order | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Details expansion
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialSelectedOrder || null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, [selectedStatus, search]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const data = await api.getOrders({
        status: selectedStatus !== 'All' ? selectedStatus : undefined,
        search: search || undefined,
      });
      setOrders(data);
      if (initialSelectedOrder) {
        const found = data.find((o) => o.id === initialSelectedOrder.id);
        if (found) setSelectedOrder(found);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setStatusUpdating(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      await api.updateOrderStatus(orderId, newStatus);
      setActionMsg(`Order status updated to ${newStatus}`);
      await loadOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, order_status: newStatus as OrderStatus });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update order');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    setStatusUpdating(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.cancelOrder(order.id);
      setActionMsg(res.message);
      await loadOrders();
      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder({ ...selectedOrder, order_status: 'Cancelled' });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel order');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleExportCsv = () => {
    const csvRows = [
      ['Order Number', 'Date', 'Customer', 'Phone', 'Address', 'Subtotal', 'Discount', 'Total Amount', 'Payment Method', 'Payment Status', 'Order Status'],
      ...orders.map((o) => [
        o.order_number,
        o.order_date || o.created_at,
        `"${(o.customer_name || '').replace(/"/g, '""')}"`,
        o.customer_phone || '',
        `"${(o.delivery_address || '').replace(/"/g, '""')}"`,
        o.subtotal,
        o.discount,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.order_status,
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shopmate_orders_${Date.now()}.csv`);
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
            <ShoppingBag className="w-6 h-6 text-indigo-400" />
            <span>Order Fulfillment & Transaction Ledger</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            End-to-end fulfillment pipeline from pending confirmation through delivery with inventory sync.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>Export Orders CSV</span>
        </button>
      </div>

      {actionMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by order #, customer, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto no-scrollbar">
          {['All', 'Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                selectedStatus === st
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Orders Table & Selected Order Drawer */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Table List */}
        <div className={`${selectedOrder ? 'lg:col-span-2' : 'lg:col-span-3'} rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] bg-slate-950/40">
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Items</th>
                  <th className="py-3 px-3">Total Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      Loading orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      No orders found matching this filter.
                    </td>
                  </tr>
                ) : (
                  orders.map((ord) => {
                    const isSelected = selectedOrder?.id === ord.id;
                    return (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedOrder(ord)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-indigo-950/40' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-indigo-400">
                          {ord.order_number}
                        </td>
                        <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                          {ord.order_date?.slice(0, 16)}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white">{ord.customer_name}</div>
                          <div className="text-[10px] text-slate-400">{ord.customer_phone}</div>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-300">
                          {ord.items?.length || ord.itemCount || 1} item(s)
                        </td>
                        <td className="py-3 px-3 font-black text-white">
                          ₹{ord.total_amount.toLocaleString()}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ord.order_status === 'Delivered'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : ord.order_status === 'Cancelled'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : ord.order_status === 'Processing' || ord.order_status === 'Packed'
                                ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {ord.order_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveInvoiceOrder(ord);
                              setIsInvoiceOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition"
                            title="Generate Invoice Receipt"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Order Detailed Sidebar */}
        {selectedOrder && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-base text-white">{selectedOrder.order_number}</h2>
                <p className="text-[11px] text-slate-400">{selectedOrder.order_date}</p>
              </div>
              <button
                onClick={() => {
                  setActiveInvoiceOrder(selectedOrder);
                  setIsInvoiceOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 text-xs font-semibold flex items-center gap-1 border border-indigo-500/40"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Invoice</span>
              </button>
            </div>

            {/* Customer Details */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-1 text-xs">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Customer Information
              </div>
              <div className="font-semibold text-white">{selectedOrder.customer_name}</div>
              <div className="text-slate-300">{selectedOrder.customer_phone}</div>
              <div className="text-slate-400 text-[11px] mt-1">{selectedOrder.delivery_address}</div>
            </div>

            {/* Order Items */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Order Items (Price Snapshot)
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(selectedOrder.items || []).map((it, idx) => (
                  <div
                    key={it.id || idx}
                    className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">{it.product_name}</div>
                      <div className="text-[10px] text-slate-400">{it.variant_details}</div>
                      <div className="text-[10px] text-indigo-300">
                        Qty: {it.quantity} &times; ₹{it.unit_price.toLocaleString()}
                      </div>
                    </div>
                    <div className="font-bold text-white">₹{it.total_price.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span>₹{selectedOrder.subtotal.toLocaleString()}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount:</span>
                  <span>-₹{selectedOrder.discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-slate-800">
                <span>Total Amount:</span>
                <span className="text-emerald-400">₹{selectedOrder.total_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                <span>Payment:</span>
                <span className="font-medium text-slate-300">
                  {selectedOrder.payment_status} ({selectedOrder.payment_method})
                </span>
              </div>
            </div>

            {/* Status Progression Workflow */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Update Order Status
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                {['Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered'].map((st) => (
                  <button
                    key={st}
                    disabled={selectedOrder.order_status === 'Cancelled' || selectedOrder.order_status === st || statusUpdating}
                    onClick={() => handleUpdateStatus(selectedOrder.id, st)}
                    className={`py-1.5 rounded-lg border transition ${
                      selectedOrder.order_status === st
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 disabled:opacity-40'
                    }`}
                  >
                    Mark {st}
                  </button>
                ))}
              </div>

              {selectedOrder.order_status !== 'Cancelled' && (
                <button
                  type="button"
                  onClick={() => handleCancelOrder(selectedOrder)}
                  className="w-full mt-2 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 font-semibold text-xs border border-rose-800 transition flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <span>Cancel Order & Restore Stock</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Printable Invoice Modal */}
      <InvoiceModal
        order={activeInvoiceOrder}
        isOpen={isInvoiceOpen}
        onClose={() => setIsInvoiceOpen(false)}
      />
    </div>
  );
};
