import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import {
  Send,
  Sparkles,
  Bot,
  User,
  ShoppingBag,
  CheckCircle,
  AlertCircle,
  Package,
  Layers,
  ArrowRight,
  Info,
  RotateCcw,
} from 'lucide-react';
import { ProductImage } from '../components/ProductImage';
import { BackButton } from '../components/BackButton';

interface CustomerShoppingPageProps {
  openCartDrawer: () => void;
  onBack?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'CUSTOMER' | 'AI';
  text: string;
  suggestedProducts?: any[];
  toolExecuted?: string;
  engine?: string;
  timestamp: string;
}

export const CustomerShoppingPage: React.FC<CustomerShoppingPageProps> = ({ openCartDrawer, onBack }) => {
  const { business, user } = useAuth();
  const { addItem, items: cartItems } = useCart();
  // The store owner can rename the assistant and set its suggested questions (Settings page).
  const assistantName = business?.assistant_name?.trim() || 'ShopMate AI';

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome greeting
  useEffect(() => {
    const greetingText =
      business?.ai_greeting ||
      `Hello! Welcome to ${business?.name || 'our retail store'}. I am ${assistantName}, your shopping assistant. How may I assist your shopping today?`;

    setMessages([
      {
        id: 'msg_welcome',
        sender: 'AI',
        text: greetingText,
        engine: 'ShopMate AI Assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, [business, assistantName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputMessage.trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: 'usr_' + Date.now(),
      sender: 'CUSTOMER',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputMessage('');
    setIsLoading(true);

    try {
      // Build conversation history context
      const historyContext = messages.slice(-6).map((m) => ({
        role: m.sender === 'CUSTOMER' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await api.sendAiMessage({
        message: textToSend,
        history: historyContext,
        customerName: user?.name || 'Customer',
        customerPhone: user?.phone || '',
      });

      const aiMsg: ChatMessage = {
        id: 'ai_' + Date.now(),
        sender: 'AI',
        text: res.reply,
        suggestedProducts: res.suggestedProducts || [],
        toolExecuted: res.toolExecuted,
        engine: res.engine || 'deterministic-retail-agent',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          sender: 'AI',
          text: 'Sorry, I encountered an issue checking the store database. Please try again or ask for another item.',
          engine: 'error-handler',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectVariant = (productId: string, variantId: string) => {
    setSelectedVariants((prev) => ({
      ...prev,
      [productId]: variantId,
    }));
  };

  const handleAddToCart = (product: any) => {
    const activeVariants = product.variants || [];
    if (activeVariants.length === 0) return;

    const chosenVariantId = selectedVariants[product.id] || activeVariants[0].id;
    const variant = activeVariants.find((v: any) => v.id === chosenVariantId) || activeVariants[0];

    let image = 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80';
    if (product.images && product.images.length > 0) {
      image = product.images[0];
    }

    addItem({
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantDetails: `Size: ${variant.size} | Colour: ${variant.colour}`,
      unitPrice: variant.price || product.currentPrice || product.discountPrice || product.regularPrice,
      quantity: 1,
      image,
      maxStock: variant.stock || 10,
    });

    // Provide instant feedback in chat
    setMessages((prev) => [
      ...prev,
      {
        id: 'cart_note_' + Date.now(),
        sender: 'AI',
        text: `Added **${product.name}** (${variant.size} / ${variant.colour}) to your cart! Click "View Cart & Checkout" below whenever you are ready to confirm your order.`,
        engine: 'system-cart',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const defaultPrompts = [
    'Show me red kurtis below ₹1,500',
    'Do you have size M available?',
    'Show me Banarasi and Chanderi sarees',
    'Show linen shirts for men',
    'What categories do you have?',
    'Track order ORD-2026-1001',
  ];
  const quickPrompts =
    business?.suggested_questions && business.suggested_questions.length > 0
      ? business.suggested_questions
      : defaultPrompts;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">

      {/* WhatsApp-Style Header */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md">
              <Bot className="w-6 h-6" />
            </div>
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-900"></span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-white">
                {assistantName}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                AI Agent Active
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {business?.name ? `${business.name} · ` : ''}Live inventory & order ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
        {business?.phone && String(business.phone).replace(/\D/g, '').length >= 8 && (
          <a
            href={`https://wa.me/${String(business.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${business.name || ''}, I have a question about your products.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition"
            title="Continue this chat on WhatsApp"
          >
            <span>Chat on WhatsApp</span>
          </a>
        )}
        <button
          onClick={openCartDrawer}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-600/20"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Cart ({cartItems.reduce((acc, i) => acc + i.quantity, 0)})</span>
        </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[560px]">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-950/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'CUSTOMER' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs space-y-2 shadow-sm ${
                  msg.sender === 'CUSTOMER'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/60'
                }`}
              >
                {/* Engine / Tool Tag */}
                {msg.sender === 'AI' && (
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-700/50 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 font-semibold text-emerald-400">
                      <Sparkles className="w-3 h-3" />
                      {assistantName}
                    </span>
                    <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">
                      {msg.engine === 'gemini-3.8-flash' ? '⚡ Gemini 3.8 Flash' : '🤖 Retail DB Engine'}
                    </span>
                  </div>
                )}

                {/* Message Body */}
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                {/* If Database Products were suggested by Tool execution */}
                {msg.suggestedProducts && msg.suggestedProducts.length > 0 && (
                  <div className="pt-2 space-y-3">
                    <div className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      <span>Live Database Inventory Results ({msg.suggestedProducts.length} items):</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {msg.suggestedProducts.map((p: any) => {
                        const variants = p.variants || [];
                        const selectedVarId = selectedVariants[p.id] || (variants[0]?.id || '');
                        const selectedVar = variants.find((v: any) => v.id === selectedVarId) || variants[0];
                        const img = (p.images && p.images[0]) || null;

                        return (
                          <div
                            key={p.id}
                            className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 space-y-2.5 text-slate-200"
                          >
                            <div className="w-full h-36 rounded-lg overflow-hidden bg-slate-950">
                              <ProductImage
                                src={img}
                                alt={p.name}
                                category={p.categoryName}
                                colour={p.colour}
                                className="w-full h-full object-cover"
                              />
                            </div>

                            <div>
                              <h4 className="font-bold text-xs text-white truncate">{p.name}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="font-bold text-emerald-400 text-sm">
                                  ₹{(p.currentPrice || p.discountPrice || p.regularPrice || 0).toLocaleString()}
                                </span>
                                {p.discountPrice && (
                                  <span className="text-[10px] text-slate-500 line-through">
                                    ₹{p.regularPrice?.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Variant / Size Selection */}
                            {variants.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 font-medium">Select Size / Stock:</span>
                                <div className="flex flex-wrap gap-1">
                                  {variants.map((v: any) => {
                                    const isSelected = selectedVarId === v.id;
                                    const inStock = v.stock > 0;
                                    return (
                                      <button
                                        key={v.id}
                                        type="button"
                                        disabled={!inStock}
                                        onClick={() => handleSelectVariant(p.id, v.id)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                          isSelected
                                            ? 'bg-indigo-600 text-white'
                                            : inStock
                                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                            : 'bg-slate-800/40 text-slate-600 line-through cursor-not-allowed'
                                        }`}
                                      >
                                        {v.size} ({v.stock} in stock)
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Add to Cart button */}
                            <button
                              type="button"
                              onClick={() => handleAddToCart(p)}
                              className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                            >
                              <ShoppingBag className="w-3.5 h-3.5" />
                              <span>Add to Cart</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  className={`text-[9px] pt-1 ${
                    msg.sender === 'CUSTOMER' ? 'text-indigo-200' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 max-w-xs text-xs text-slate-400">
              <Bot className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>{assistantName} is checking the store inventory...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Question Chips */}
        <div className="p-2.5 border-t border-slate-800 bg-slate-900/90 overflow-x-auto flex gap-2 no-scrollbar">
          {quickPrompts.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(q)}
              className="shrink-0 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 hover:bg-indigo-950 hover:text-indigo-300 hover:border-indigo-700 border border-slate-700/60 transition"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Message Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 border-t border-slate-800 bg-slate-900 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your shopping enquiry (e.g. 'Show red kurtis below 1500', 'Do you have size M?')..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
