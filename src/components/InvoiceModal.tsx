import React from 'react';
import { Order } from '../types';
import { X, Printer, CheckCircle, Package } from 'lucide-react';

interface InvoiceModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, isOpen, onClose }) => {
  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 print:shadow-none print:border-none">
        {/* Modal Top Bar */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-400" />
            <span className="font-semibold text-sm">Tax Invoice & Order Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Sheet */}
        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {order.business_name || 'Tax Invoice'}
              </h1>
              {order.business_address && (
                <p className="text-xs text-slate-500 mt-1 max-w-xs">{order.business_address}</p>
              )}
              {order.business_phone && (
                <p className="text-xs text-slate-500">Phone: {order.business_phone}</p>
              )}
            </div>
            <div className="text-right">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                TAX INVOICE
              </span>
              <div className="mt-2 text-xs text-slate-500">Invoice No:</div>
              <div className="font-mono font-bold text-sm text-slate-900">{order.order_number}</div>
              <div className="text-xs text-slate-500 mt-1">Date: {order.order_date || order.created_at}</div>
            </div>
          </div>

          {/* Customer & Shipping Info */}
          <div className="grid grid-cols-2 gap-6 text-xs border-b border-slate-200 pb-6">
            <div>
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2 text-indigo-900">
                Billed / Shipped To:
              </h3>
              <p className="font-semibold text-slate-900">{order.customer_name}</p>
              <p className="text-slate-600 mt-0.5">{order.customer_phone}</p>
              {order.customer_email && <p className="text-slate-600">{order.customer_email}</p>}
              <p className="text-slate-600 mt-1 leading-relaxed">{order.delivery_address}</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2 text-indigo-900">
                Payment & Fulfillment:
              </h3>
              <p className="text-slate-600">
                Payment Method: <span className="font-semibold text-slate-900">{order.payment_method}</span>
              </p>
              <p className="text-slate-600 mt-1">
                Payment Status:{' '}
                <span className={`font-semibold ${order.payment_status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {order.payment_status}
                </span>
              </p>
              <p className="text-slate-600 mt-1">
                Fulfillment Status:{' '}
                <span className="font-semibold text-indigo-600">{order.order_status}</span>
              </p>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                  <th className="py-2.5">Item Description</th>
                  <th className="py-2.5 text-center">Qty</th>
                  <th className="py-2.5 text-right">Unit Price</th>
                  <th className="py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(order.items || []).map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{item.product_name}</div>
                      <div className="text-[11px] text-slate-500">{item.variant_details}</div>
                    </td>
                    <td className="py-3 text-center font-medium text-slate-700">{item.quantity}</td>
                    <td className="py-3 text-right font-medium text-slate-700">₹{item.unit_price.toLocaleString()}</td>
                    <td className="py-3 text-right font-bold text-slate-900">₹{item.total_price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total Breakdown */}
          <div className="border-t border-slate-200 pt-4 flex justify-end">
            <div className="w-64 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-medium text-slate-900">₹{order.subtotal.toLocaleString()}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span>-₹{order.discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>GST / Taxes:</span>
                <span className="font-medium text-slate-900">₹{order.tax.toLocaleString()}</span>
              </div>
              <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-base text-slate-950">
                <span>Total Amount:</span>
                <span>₹{order.total_amount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Terms Footer */}
          <div className="border-t border-slate-200 pt-4 text-[10px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-600">Terms & Conditions:</p>
            <p>1. Returns or exchanges must be initiated within 7 days with intact tags and original invoice.</p>
            <p>2. Powered by ShopMate AI - Automated Retail Assistant and Multi-Channel Order Ledger.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
