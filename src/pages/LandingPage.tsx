import React from 'react';
import {
  Store,
  Sparkles,
  Bot,
  Layers,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
  ShieldCheck,
  Zap,
  Package,
  ShoppingBag,
  Clock,
  HelpCircle,
  Mail,
  Phone,
  Send,
} from 'lucide-react';

interface LandingPageProps {
  onStartShopping: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartShopping,
  onOpenLogin,
  onOpenRegister,
}) => {
  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.25),rgba(255,255,255,0))] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Multi-Tenant AI-Powered Retail Commerce SaaS</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Turn WhatsApp Customer Chats Into{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
                Instant Verified Orders
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Stop losing sales to unanswered messages about sizes, colours, stock, and prices.
              ShopMate AI connects your real inventory database with an autonomous shopping assistant that finds matching products and securely creates orders 24/7.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <button
                onClick={onStartShopping}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/25 flex items-center gap-2.5 transition transform hover:-translate-y-0.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Try Live AI Shopping Assistant</span>
              </button>

              <button
                onClick={onOpenRegister}
                className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-700 flex items-center gap-2 transition"
              >
                <span>Register Your Shop (Free Demo)</span>
                <ArrowRight className="w-4 h-4 text-indigo-400" />
              </button>
            </div>

            {/* Quick KPI badges */}
            <div className="pt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-2xl font-black text-indigo-400">100%</div>
                <div className="text-xs text-slate-400 mt-0.5">Real DB & Variant Stock</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-2xl font-black text-emerald-400">&lt; 3 Sec</div>
                <div className="text-xs text-slate-400 mt-0.5">Instant AI Tool Response</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-2xl font-black text-purple-400">Isolated</div>
                <div className="text-xs text-slate-400 mt-0.5">Multi-Tenant Tenant DB</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-2xl font-black text-amber-400">Zero</div>
                <div className="text-xs text-slate-400 mt-0.5">Hallucinated Stock or Price</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Business Problem & Solution */}
      <section className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* The Pain */}
          <div className="space-y-6 p-8 rounded-2xl bg-rose-950/20 border border-rose-900/40">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-900/40 text-rose-300 text-xs font-bold uppercase tracking-wider">
              The Retail Challenge
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
              Retailers Receive 500+ Messages Every Day — But Can Only Answer a Fraction
            </h2>
            <ul className="space-y-3.5 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-rose-900/50 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span>Customers ask: "Do you have red kurtis under ₹1,500 in size M?" Staff has to search manually across physical racks.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-rose-900/50 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span>Delayed responses mean customers abandon chats and buy from larger e-commerce portals.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-rose-900/50 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
                <span>Manual stock-checks lead to accidental overselling of out-of-stock sizes and unhappy customer cancellations.</span>
              </li>
            </ul>
          </div>

          {/* The Solution */}
          <div className="space-y-6 p-8 rounded-2xl bg-indigo-950/20 border border-indigo-900/40">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-900/40 text-indigo-300 text-xs font-bold uppercase tracking-wider">
              The ShopMate AI Solution
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
              An Autonomous Agent With Direct Backend Database Authority
            </h2>
            <ul className="space-y-3.5 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Natural Language Understanding:</strong> Understands complex queries like "Show me cotton sarees below 2000 in pastel shades".</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Real-time Variant Inventory:</strong> Checks exact size/colour quantities and prevents overselling using transaction locks.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Deterministic Fallback:</strong> Always functional whether Gemini API is active or offline.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. Core Features Grid */}
      <section className="py-16 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-bold text-white">Full-Stack Retail Superpowers</h2>
            <p className="text-sm text-slate-400">
              Everything required to run, automate, and scale physical or online retail businesses in one integrated SaaS platform.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 hover:border-indigo-500/50 transition">
              <div className="w-10 h-10 rounded-xl bg-indigo-950 text-indigo-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Agentic AI Shopping Assistant</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connects directly to your database with function calling tools (`search_products`, `check_inventory`, `create_order`, `get_order_status`).
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 hover:border-indigo-500/50 transition">
              <div className="w-10 h-10 rounded-xl bg-emerald-950 text-emerald-400 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Variant-Aware Inventory Ledger</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tracks specific sizes and colours independently. Maintains complete audit history with transaction safe deductions and restoration.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 hover:border-indigo-500/50 transition">
              <div className="w-10 h-10 rounded-xl bg-purple-950 text-purple-400 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Multi-Channel Order Pipeline</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Manage full status progression: Pending &rarr; Confirmed &rarr; Processing &rarr; Packed &rarr; Shipped &rarr; Delivered with instant tax receipt generation.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 hover:border-indigo-500/50 transition">
              <div className="w-10 h-10 rounded-xl bg-blue-950 text-blue-400 flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Enquiry & Conversation CRM</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Track every customer conversation thread. Generate automated AI summaries for store staff and assign customer tickets.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 hover:border-indigo-500/50 transition">
              <div className="w-10 h-10 rounded-xl bg-pink-950 text-pink-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Strict Multi-Tenant Isolation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every business's catalog, customer list, and financial transactions are completely isolated with foreign key database boundaries.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 hover:border-indigo-500/50 transition">
              <div className="w-10 h-10 rounded-xl bg-amber-950 text-amber-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Real Financial Analytics</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Calculated strictly from real database transactions. View revenue trends, best-selling products, category shares, and low stock warnings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Supported Industries */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Engineered For Diverse Retail Sectors</h2>
          <p className="text-xs text-slate-400">Tailored variant structures and product search for retail commerce.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { title: 'Saree & Ethnic Boutiques', desc: 'Drapes, weaves, pallu details & blouse fabrics', icon: '🥻' },
            { title: 'Kurti & Apparel Stores', desc: 'Size matrices (S-XXL), cotton, silk & festive lines', icon: '👗' },
            { title: 'Jewellery & Accessories', desc: 'Kundan, Jadau, 22K gold plated & silver sets', icon: '✨' },
            { title: 'Footwear & Juttis', desc: 'Euro/India shoe sizing, leather & cushioned flats', icon: '👠' },
            { title: 'Men & Women Shirts', desc: 'Linen, twill, formal fits & collar variants', icon: '👔' },
            { title: 'Denim & Streetwear', desc: 'Waist sizes, stretch denim, graphic oversized tees', icon: '👖' },
            { title: 'Electronics & Gadgets', desc: 'Warranty, specs, accessories & model variants', icon: '📱' },
            { title: 'Wholesale & B2B Hubs', desc: 'Bulk sets, minimum order limits & carton ledgers', icon: '📦' },
          ].map((ind, i) => (
            <div key={i} className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 text-center">
              <div className="text-2xl mb-1">{ind.icon}</div>
              <h4 className="font-bold text-xs text-white">{ind.title}</h4>
              <p className="text-[11px] text-slate-400">{ind.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Pricing Plans */}
      <section className="py-16 bg-slate-900/60 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="inline-block px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 text-xs font-semibold">
              Flexible SaaS Tiers
            </div>
            <h2 className="text-3xl font-bold text-white">Simple, Transparent Retail Pricing</h2>
            <p className="text-xs text-slate-400">Start with our fully functional demonstration and upgrade anytime.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="font-bold text-lg text-white">Starter</h3>
                <p className="text-xs text-slate-400">Ideal for single boutique shops starting digital ordering.</p>
                <div className="text-3xl font-black text-white">
                  ₹999 <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Up to 100 products</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> AI Shopping Assistant</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Basic Inventory Ledger</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 1 Owner Account</li>
                </ul>
              </div>
              <button
                onClick={onOpenRegister}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
              >
                Select Starter
              </button>
            </div>

            {/* Pro (Featured) */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-indigo-950/80 to-slate-900 border-2 border-indigo-500 shadow-xl shadow-indigo-500/10 flex flex-col justify-between space-y-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-indigo-600 text-[10px] font-bold text-white uppercase tracking-wider">
                Most Popular
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-lg text-white">Professional</h3>
                <p className="text-xs text-slate-400">For active retail stores with high daily customer enquiries.</p>
                <div className="text-3xl font-black text-white">
                  ₹2,499 <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-200">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited products & variants</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Gemini 3.8 Flash + Fallback Agent</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Up to 5 Employee accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Multi-channel WhatsApp Simulator</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Full Sales & Inventory Analytics</li>
                </ul>
              </div>
              <button
                onClick={onOpenRegister}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-600/25"
              >
                Start Free Pro Demo
              </button>
            </div>

            {/* Business */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="font-bold text-lg text-white">Enterprise / Chain</h3>
                <p className="text-xs text-slate-400">For multi-branch chains and wholesale distributors.</p>
                <div className="text-3xl font-black text-white">
                  ₹5,999 <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Multi-Branch Inventory Sync</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited Employees & Roles</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Meta WhatsApp Cloud API Production</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Dedicated Account Manager</li>
                </ul>
              </div>
              <button
                onClick={onOpenRegister}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
              >
                Contact Enterprise
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ Section */}
      <section className="py-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Frequently Asked Questions</h2>
          <p className="text-xs text-slate-400">Everything you need to know about ShopMate AI.</p>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'How does the AI assistant know our actual stock and prices?',
              a: 'ShopMate AI executes backend database tools in real-time. When a customer asks about a product, the AI queries the store’s relational SQLite database directly to check variant sizes, colours, and live quantities before replying. It never makes up prices or fake availability.',
            },
            {
              q: 'What happens if the Gemini API key is missing or quota is exhausted?',
              a: 'The platform automatically uses our built-in deterministic retail engine fallback! Customers can still search products, filter by color and price, check inventory, add to cart, and place orders without interruption.',
            },
            {
              q: 'Can one store see another store’s customer details or orders?',
              a: 'No. ShopMate AI enforces strict multi-tenant isolation. Every query and transaction is scoped by business_id. You can test this right in the app by switching between KalaKriti Ethnic and UrbanVogue!',
            },
            {
              q: 'How are orders and stock deductions protected from overselling?',
              a: 'All order creation operations use atomic database transactions. The system checks exact variant quantities, records the price snapshot, deducts stock, and writes a ledger entry. If an order is cancelled, stock is restored safely.',
            },
          ].map((faq, i) => (
            <div key={i} className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{faq.q}</span>
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed pl-6">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-12 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
              <Store className="w-4 h-4" />
            </div>
            <span className="font-bold text-white text-base">ShopMate AI</span>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">v1.0 Production MVP</span>
          </div>

          <div className="flex flex-wrap gap-6 text-slate-400">
            <button onClick={onStartShopping} className="hover:text-white transition">AI Assistant</button>
            <button onClick={onOpenLogin} className="hover:text-white transition">Store Login</button>
            <button onClick={onOpenRegister} className="hover:text-white transition">Register Shop</button>
            <a href="/privacy" className="hover:text-white transition">Privacy</a>
            <a href="/terms" className="hover:text-white transition">Terms</a>
            <a href="/data-deletion" className="hover:text-white transition">Data deletion</a>
          </div>

          <div className="text-slate-500 text-center md:text-right">
            &copy; 2026 ShopMate AI, operated by Kesavan Arul (codexkesavan). Contact: codexk7@gmail.com
          </div>
        </div>
      </footer>
    </div>
  );
};
