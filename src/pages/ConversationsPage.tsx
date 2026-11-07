import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Conversation, Message } from '../types';
import { BackButton } from '../components/BackButton';
import {
  MessageSquare,
  Search,
  Sparkles,
  Bot,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  RefreshCw,
} from 'lucide-react';

interface ConversationsPageProps {
  onBack?: () => void;
}

export const ConversationsPage: React.FC<ConversationsPageProps> = ({ onBack }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarising, setIsSummarising] = useState(false);
  const [summaryMsg, setSummaryMsg] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const data = await api.getConversations();
      setConversations(data);
      if (data.length > 0 && !selectedConv) {
        setSelectedConv(data[0]);
        loadMessages(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const msgs = await api.getConversationMessages(convId);
      setMessages(msgs);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectConv = (c: Conversation) => {
    setSelectedConv(c);
    setSummaryMsg(c.ai_summary || null);
    loadMessages(c.id);
  };

  const handleGenerateSummary = async () => {
    if (!selectedConv) return;
    setIsSummarising(true);
    try {
      const res = await api.summariseConversation(selectedConv.id);
      setSummaryMsg(res.summary);
      setSelectedConv({ ...selectedConv, ai_summary: res.summary });
      loadConversations();
    } catch (err) {
      setSummaryMsg('Unable to generate AI summary at this moment.');
    } finally {
      setIsSummarising(false);
    }
  };

  const filtered = conversations.filter((c) => {
    const matchSearch =
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.customer_phone && c.customer_phone.includes(search));
    if (!matchSearch) return false;
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-indigo-400" />
            <span>Customer Enquiries & AI Conversation CRM</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track customer shopping threads, tool execution logs, and automated AI enquiry summaries.
          </p>
        </div>

        <button
          onClick={loadConversations}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Threads</span>
        </button>
      </div>

      {/* Main Grid: Thread List & Detail Chat View */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Thread List */}
        <div className="space-y-3">
          {/* Search & Filter */}
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search enquiry..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {['ALL', 'New', 'Open', 'Waiting', 'Resolved', 'Closed'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition ${
                    statusFilter === s
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white bg-slate-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations Cards */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-10 text-slate-400 text-xs">Loading enquiries...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">No conversations found.</div>
            ) : (
              filtered.map((c) => {
                const isSelected = selectedConv?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConv(c)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition text-xs space-y-1.5 ${
                      isSelected
                        ? 'bg-indigo-950/50 border-indigo-600 text-white'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{c.customer_name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          c.status === 'Resolved'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : c.status === 'Open' || c.status === 'New'
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-500" />
                      <span>{c.customer_phone || 'WhatsApp Guest'}</span>
                    </div>

                    <div className="text-[11px] text-slate-300 truncate">
                      {c.last_message || 'Customer enquiry started'}
                    </div>

                    <div className="text-[9px] text-slate-500 flex justify-between pt-1 border-t border-slate-800">
                      <span>{c.message_count || 1} messages</span>
                      <span>{c.last_message_time?.slice(0, 16) || c.updated_at?.slice(0, 16)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Conversation Thread & AI Summary */}
        <div className="lg:col-span-2 space-y-4">
          {selectedConv ? (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col h-[580px] shadow-xl">
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-sm text-white">{selectedConv.customer_name}</h2>
                  <p className="text-xs text-slate-400">{selectedConv.customer_phone || 'Customer Enquiry'}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateSummary}
                    disabled={isSummarising}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isSummarising ? 'Summarising...' : 'Generate AI Summary'}</span>
                  </button>
                </div>
              </div>

              {/* AI Summary Banner */}
              {(summaryMsg || selectedConv.ai_summary) && (
                <div className="p-3.5 mx-4 mt-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 text-xs text-indigo-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Assistant Requirement Summary:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-indigo-200/90">
                    {summaryMsg || selectedConv.ai_summary}
                  </p>
                </div>
              )}

              {/* Message History Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/40">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.sender_type === 'CUSTOMER' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl p-3 text-xs space-y-1 shadow-sm ${
                        m.sender_type === 'CUSTOMER'
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400">
                        <span className="font-semibold text-slate-300">{m.sender_name}</span>
                        <span>{m.created_at?.slice(11, 16)}</span>
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 text-xs">
              Select a customer conversation from the list to view thread.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
