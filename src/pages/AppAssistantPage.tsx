import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { Send, Sparkles, Bot, ArrowRight } from 'lucide-react';
import { BackButton } from '../components/BackButton';

interface AppAssistantPageProps {
  onBack?: () => void;
  onOpenRegister: () => void;
  onOpenLogin: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'USER' | 'AI';
  text: string;
  engine?: string;
  timestamp: string;
}

const QUESTIONS = [
  'What is ShopMate AI?',
  'How do I register my business?',
  'What can the AI shopping assistant do?',
  'How does the demo work?',
  'What roles are available?',
  'Can I sign in with Google?',
];

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The public assistant shown to visitors who are not signed in. It explains the ShopMate AI
 * application itself - it is not tied to any store, so there is no catalogue and no cart.
 */
export const AppAssistantPage: React.FC<AppAssistantPageProps> = ({ onBack, onOpenRegister, onOpenLogin }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'AI',
      text:
        "Hi! I'm the ShopMate AI assistant. Ask me anything about the platform - what it does, how to register your business, how the demo works, roles, inventory, orders and more.",
      timestamp: now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const send = async (custom?: string) => {
    const text = (custom ?? input).trim();
    if (!text || isLoading) return;
    const history = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({ role: m.sender === 'USER' ? 'user' : 'assistant', content: m.text }));

    setMessages((prev) => [...prev, { id: 'u_' + Date.now(), sender: 'USER', text, timestamp: now() }]);
    if (!custom) setInput('');
    setIsLoading(true);
    try {
      const res = await api.askAppAssistant(text, history);
      setMessages((prev) => [
        ...prev,
        { id: 'a_' + Date.now(), sender: 'AI', text: res.reply || 'Sorry, I could not find an answer to that.', engine: res.engine, timestamp: now() },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: 'e_' + Date.now(), sender: 'AI', text: err?.message || 'Sorry, I could not answer that right now. Please try again.', engine: 'error', timestamp: now() },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      {onBack && <BackButton onClick={onBack} />}

      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md">
              <Bot className="w-6 h-6" />
            </div>
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-900"></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-white">ShopMate AI</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                Online
              </span>
            </div>
            <p className="text-xs text-slate-400">Ask me anything about the ShopMate AI application</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenLogin}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            Try a demo
          </button>
          <button
            onClick={onOpenRegister}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-md shadow-indigo-600/20"
          >
            <span>Register your business</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[560px]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-950/40" aria-live="polite">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs space-y-2 shadow-sm ${
                  msg.sender === 'USER'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/60'
                }`}
              >
                {msg.sender === 'AI' && (
                  <div className="flex items-center gap-1 pb-1 border-b border-slate-700/50 text-[10px] font-semibold text-emerald-400">
                    <Sparkles className="w-3 h-3" />
                    ShopMate AI
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                <div className={`text-[9px] pt-1 ${msg.sender === 'USER' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 max-w-xs text-xs text-slate-400">
              <Bot className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>ShopMate AI is typing...</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-2.5 border-t border-slate-800 bg-slate-900/90 overflow-x-auto flex gap-2 no-scrollbar">
          {QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="shrink-0 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 hover:bg-indigo-950 hover:text-indigo-300 hover:border-indigo-700 border border-slate-700/60 transition"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="p-3 border-t border-slate-800 bg-slate-900 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about features, registration, the demo, roles..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
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
