import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ProductImage } from './ProductImage';
import { X, Trash2, ShoppingBag, ArrowRight, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCompleted?: (orderNumber: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ isOpen, onClose, onOrderCompleted }) => {
  const { items, updateQuantity, removeItem, clearCart, subtotal, totalCount } = useCart();
  const { user } = useAuth();

  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState('');

  if (!isOpen) return null;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!customerName || !customerPhone || !deliveryAddress) {
      setErrorMsg('Please fill in name, phone, and complete delivery address.');
      return;
    }

    if (items.length === 0) {
      setErrorMsg('Your cart is empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const orderPayload = {
        customerName,
        customerPhone,
        customerEmail,
        deliveryAddress,
        paymentMethod,
        notes,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      };

      const result = await api.createOrder(orderPayload);
      clearCart();
      setConfirmedOrderNumber(result.orderNumber);
      setStep('success');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      if (onOrderCompleted) {
        onOrderCompleted(result.orderNumber);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to place order. Please check inventory stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 text-slate-100 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-indigo-400" />
            <h2 className="font-bold text-base">
              {step === 'cart' && `Shopping Cart (${totalCount})`}
              {step === 'checkout' && 'Checkout & Confirmation'}
              {step === 'success' && 'Order Placed!'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="m-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 'cart' && (
            <>
              {items.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-3">
                  <ShoppingBag className="w-12 h-12 mx-auto text-slate-600" />
                  <p className="font-medium text-sm">Your shopping cart is empty.</p>
                  <p className="text-xs text-slate-500">
                    Ask ShopMate AI in the shopping assistant to discover and add products!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.variantId}
                      className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3"
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 shrink-0">
                        <ProductImage
                          src={item.image}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs text-white truncate">{item.productName}</h4>
                        <p className="text-[11px] text-slate-400">{item.variantDetails}</p>
                        <div className="font-semibold text-xs text-indigo-300 mt-1">
                          ₹{item.unitPrice.toLocaleString()} each
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                            className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="text-xs font-semibold px-2">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                            disabled={item.quantity >= item.maxStock}
                            className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center text-xs font-bold disabled:opacity-40"
                          >
                            +
                          </button>
                          <span className="text-[10px] text-slate-500 ml-1">
                            (Max: {item.maxStock})
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => removeItem(item.variantId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 transition"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 text-indigo-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Backend inventory verification & price calculation will be enforced.</span>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Delivery Address *</label>
                <textarea
                  required
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                  <option value="UPI / QR Code">UPI / Instant Online</option>
                  <option value="Credit / Debit Card">Credit / Debit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Order Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Ring the bell twice or gift wrap"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </form>
          )}

          {step === 'success' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/30">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Order Confirmed!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Thank you! Your order has been placed directly into the store's database.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Order Reference:</span>
                  <span className="font-bold text-emerald-400">{confirmedOrderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment:</span>
                  <span className="text-slate-200">{paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    Confirmed
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400">
                You can ask ShopMate AI: <em>"Track {confirmedOrderNumber}"</em> at any time to monitor dispatch status!
              </div>

              <button
                onClick={() => {
                  setStep('cart');
                  onClose();
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
              >
                Continue Shopping
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {step !== 'success' && (
          <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-900/90">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Total Amount:</span>
              <span className="font-bold text-lg text-white">₹{subtotal.toLocaleString()}</span>
            </div>

            {step === 'cart' && (
              <button
                onClick={() => setStep('checkout')}
                disabled={items.length === 0}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-40 shadow-lg shadow-indigo-600/20"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {step === 'checkout' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={isSubmitting}
                  className="w-2/3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                >
                  {isSubmitting ? 'Confirming...' : 'Confirm & Place Order'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
