import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, LayoutDashboard, LogIn, Users, ShoppingBag, Building2, Receipt, LogOut, Download,
  Search, RefreshCw, AlertCircle, Lock, Mail, ChevronLeft, ChevronRight, Activity, Store, ArrowLeft,
} from 'lucide-react';
import { superAdminApi, saToken, SuperAdminAuthError } from '../services/superAdminApi';
import { GoogleAuthButton } from '../components/GoogleAuthButton';

type Tab = 'overview' | 'logins' | 'users' | 'buyers' | 'businesses' | 'orders';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'logins', label: 'Login activity', icon: LogIn },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'buyers', label: 'Buyers', icon: ShoppingBag },
  { id: 'businesses', label: 'Businesses', icon: Building2 },
  { id: 'orders', label: 'Orders', icon: Receipt },
];

const fmtNum = (n: number) => (n ?? 0).toLocaleString('en-IN');
const fmtMoney = (n: number) => '₹' + Math.round(n ?? 0).toLocaleString('en-IN');
const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? s : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
const SignIn: React.FC<{ onSignedIn: () => void }> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (token: string) => { saToken.set(token); onSignedIn(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try { finish((await superAdminApi.login(email.trim(), password)).token); }
    catch (err: any) { setError(err.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  };

  const google = async (credential: string) => {
    setError(null); setBusy(true);
    try { finish((await superAdminApi.loginWithGoogle(credential)).token); }
    catch (err: any) { setError(err.message || 'Google sign-in failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Super Admin Portal</h1>
          <p className="text-xs text-slate-400">Platform-wide visibility for the ShopMate AI owner. Authorised accounts only.</p>
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /><span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 text-xs">
          <label className="block">
            <span className="block text-slate-300 font-medium mb-1">Email address</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500" />
            </div>
          </label>
          <label className="block">
            <span className="block text-slate-300 font-medium mb-1">Password</span>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
          </label>
          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/25 disabled:opacity-60">
            {busy ? 'Verifying...' : 'Sign in to admin portal'}
          </button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
            <span className="flex-1 h-px bg-slate-800" /><span>or</span><span className="flex-1 h-px bg-slate-800" />
          </div>
          <GoogleAuthButton onCredential={google} text="signin_with" disabled={busy} disabledHint="Please wait..." />
        </div>

        <a href="/" className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to ShopMate AI
        </a>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
const Kpi: React.FC<{ label: string; value: string; hint?: string; accent?: string }> = ({ label, value, hint, accent = 'text-white' }) => (
  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
    <div className="text-[11px] font-medium text-slate-400">{label}</div>
    <div className={`text-2xl font-black mt-1 tabular-nums ${accent}`}>{value}</div>
    {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
  </div>
);

const BarChart: React.FC<{ title: string; data: { label: string; value: number }[]; color: string }> = ({ title, data, color }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
      <div className="text-xs font-bold text-white mb-3">{title}</div>
      {data.length === 0 || data.every((d) => d.value === 0) ? (
        <div className="h-32 flex items-center justify-center text-[11px] text-slate-500">No activity in this period yet</div>
      ) : (
        <div className="flex items-end gap-1.5 h-32" role="img" aria-label={title}>
          {data.map((d) => (
            <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full group">
              <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition">{d.value}</span>
              <div className="w-full rounded-t" style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, background: color }} title={`${d.label}: ${d.value}`} />
              <span className="text-[9px] text-slate-500 truncate w-full text-center">{d.label.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Fill in missing days so charts show a continuous 14-day window. */
function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  return out;
}

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

function downloadCsv(name: string, rows: Record<string, any>[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const Badge: React.FC<{ tone: 'green' | 'red' | 'slate' | 'indigo' | 'amber'; children: React.ReactNode }> = ({ tone, children }) => {
  const tones = {
    green: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    red: 'bg-rose-950 text-rose-300 border-rose-800',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    indigo: 'bg-indigo-950 text-indigo-300 border-indigo-800',
    amber: 'bg-amber-950 text-amber-300 border-amber-800',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${tones[tone]}`}>{children}</span>;
};

const roleLabel: Record<string, string> = { BUSINESS_OWNER: 'Store owner', EMPLOYEE: 'Employee', CUSTOMER: 'Customer', SUPER_ADMIN: 'Super admin' };

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
const Overview: React.FC<{ includeDemo: boolean; onAuthError: () => void }> = ({ includeDemo, onAuthError }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await superAdminApi.get('/overview', { include_demo: includeDemo })); }
    catch (err: any) { if (err instanceof SuperAdminAuthError) onAuthError(); else setError(err.message); }
  }, [includeDemo, onAuthError]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox message={error} retry={load} />;
  if (!data) return <Loading />;
  const { totals, activity } = data;
  const days = lastDays(14);
  const loginMap = new Map<string, number>((data.loginsByDay || []).map((d: any) => [d.day, d.logins]));
  const signupMap = new Map<string, number>((data.signupsByDay || []).map((d: any) => [d.day, d.n]));

  return (
    <div className="space-y-6">
      {Array.isArray(data.warnings) && data.warnings.length > 0 && (
        <div role="alert" className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs space-y-1">
          <div className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-400" />Some figures could not be loaded</div>
          {data.warnings.map((w: any) => (
            <div key={w.section} className="font-mono text-[11px] text-amber-300/90">{w.section}: {w.message}</div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Active now" value={fmtNum(activity.activeNow)} hint="seen in the last 15 minutes" accent="text-emerald-400" />
        <Kpi label="Logins today" value={fmtNum(activity.loginsToday)} hint={`${fmtNum(activity.logins7d)} in 7 days`} />
        <Kpi label="Unique users (7 days)" value={fmtNum(activity.uniqueUsers7d)} hint={`${fmtNum(activity.logins30d)} logins in 30 days`} />
        <Kpi label="Failed sign-ins (24h)" value={fmtNum(activity.failed24h)} accent={activity.failed24h > 0 ? 'text-amber-400' : 'text-white'} />
        <Kpi label="Registered businesses" value={fmtNum(totals.businesses)} hint={`${fmtNum(totals.owners)} owners · ${fmtNum(totals.employees)} staff`} />
        <Kpi label="Buyers" value={fmtNum(totals.buyers)} hint={`${fmtNum(totals.customerAccounts)} customer accounts`} />
        <Kpi label="Orders" value={fmtNum(totals.orders)} />
        <Kpi label="Revenue (excl. cancelled)" value={fmtMoney(totals.revenue)} accent="text-indigo-300" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BarChart title="Logins per day (14 days)" color="#6366f1" data={days.map((d) => ({ label: d, value: loginMap.get(d) || 0 }))} />
        <BarChart title="New registrations per day (14 days)" color="#10b981" data={days.map((d) => ({ label: d, value: signupMap.get(d) || 0 }))} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs font-bold text-white mb-3">Successful sign-ins by method</div>
          {(data.byMethod || []).length === 0 ? <div className="text-[11px] text-slate-500">Nothing yet</div> : (
            <ul className="space-y-2">
              {data.byMethod.map((m: any) => (
                <li key={m.method} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 capitalize">{m.method === 'superadmin' ? 'Super admin' : m.method}</span>
                  <span className="font-semibold text-white tabular-nums">{fmtNum(m.n)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
            Demo persona visits: <span className="text-slate-200 font-semibold">{fmtNum(activity.demoVisits)}</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs font-bold text-white mb-3">Top businesses by revenue</div>
          {(data.topBusinesses || []).length === 0 ? <div className="text-[11px] text-slate-500">No businesses yet</div> : (
            <ul className="space-y-2">
              {data.topBusinesses.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between text-xs gap-3">
                  <span className="text-slate-200 truncate">{b.name}<span className="text-slate-500"> · {b.category}</span></span>
                  <span className="text-slate-300 tabular-nums whitespace-nowrap">{fmtNum(b.orders)} orders · {fmtMoney(b.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const Loading = () => <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2"><Activity className="w-4 h-4 animate-pulse text-indigo-400" />Loading...</div>;
const ErrorBox: React.FC<{ message: string; retry: () => void }> = ({ message, retry }) => (
  <div role="alert" className="p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center justify-between gap-3">
    <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-rose-400" />{message}</span>
    <button onClick={retry} className="px-3 py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-white font-semibold">Retry</button>
  </div>
);

// ---------------------------------------------------------------------------
// Generic paginated table
// ---------------------------------------------------------------------------
interface Column { key: string; label: string; render?: (row: any) => React.ReactNode; csv?: (row: any) => any; align?: 'right' }
interface TableProps {
  path: string; title: string; columns: Column[]; includeDemo: boolean; onAuthError: () => void;
  filters?: { key: string; label: string; options: { value: string; label: string }[] }[];
  searchPlaceholder?: string;
}

const DataTable: React.FC<TableProps> = ({ path, title, columns, includeDemo, onAuthError, filters = [], searchPlaceholder = 'Search...' }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  useEffect(() => { const t = setTimeout(() => { setQuery(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await superAdminApi.get(path, { page, limit, q: query, include_demo: includeDemo, ...filterValues });
      setRows(res.rows || []); setTotal(res.total || 0);
    } catch (err: any) {
      if (err instanceof SuperAdminAuthError) onAuthError(); else setError(err.message);
    } finally { setLoading(false); }
  }, [path, page, query, includeDemo, filterValues, onAuthError]);
  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));
  const exportRows = () => downloadCsv(title.toLowerCase().replace(/\s+/g, '-'), rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.csv ? c.csv(r) : r[c.key]]))));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
        </div>
        {filters.map((f) => (
          <select key={f.key} aria-label={f.label} value={filterValues[f.key] || ''}
            onChange={(e) => { setFilterValues((p) => ({ ...p, [f.key]: e.target.value })); setPage(1); }}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
            <option value="">{f.label}: all</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <button onClick={load} title="Refresh" className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"><RefreshCw className="w-3.5 h-3.5" /></button>
        <button onClick={exportRows} disabled={rows.length === 0} className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 hover:border-slate-700 flex items-center gap-1.5 disabled:opacity-40 transition">
          <Download className="w-3.5 h-3.5" />Export page (CSV)
        </button>
      </div>

      {error ? <ErrorBox message={error} retry={load} /> : (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                {columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 font-semibold whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">Nothing to show{query ? ' for this search' : ' yet'}.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id || i} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                  {columns.map((c) => <td key={c.key} className={`px-4 py-2.5 text-slate-200 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{fmtNum(total)} {total === 1 ? 'record' : 'records'}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 hover:border-slate-700"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 hover:border-slate-700"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  );
};

const methodTone = (m: string) => (m === 'google' ? 'indigo' : m === 'demo' ? 'amber' : m === 'register' ? 'green' : 'slate');

const TABLES: Record<Exclude<Tab, 'overview'>, Omit<TableProps, 'includeDemo' | 'onAuthError'>> = {
  logins: {
    path: '/logins', title: 'Login activity', searchPlaceholder: 'Search by name or email',
    filters: [
      { key: 'status', label: 'Result', options: [{ value: 'success', label: 'Successful' }, { value: 'failed', label: 'Failed' }] },
      { key: 'method', label: 'Method', options: ['password', 'google', 'register', 'superadmin', 'demo'].map((m) => ({ value: m, label: m })) },
      { key: 'role', label: 'Role', options: Object.entries(roleLabel).map(([value, label]) => ({ value, label })) },
    ],
    columns: [
      { key: 'created_at', label: 'When', render: (r) => fmtDate(r.created_at), csv: (r) => r.created_at },
      { key: 'name', label: 'User', render: (r) => <div><div className="font-medium">{r.name || '—'}</div><div className="text-[10px] text-slate-500">{r.email || '—'}</div></div>, csv: (r) => `${r.name || ''} <${r.email || ''}>` },
      { key: 'role', label: 'Role', render: (r) => (r.role ? roleLabel[r.role] || r.role : '—') },
      { key: 'business_name', label: 'Business' },
      { key: 'method', label: 'Method', render: (r) => <Badge tone={methodTone(r.method) as any}>{r.method}</Badge> },
      { key: 'success', label: 'Result', render: (r) => (r.success ? <Badge tone="green">Success</Badge> : <Badge tone="red">Failed{r.failure_reason ? ` · ${r.failure_reason}` : ''}</Badge>), csv: (r) => (r.success ? 'success' : `failed: ${r.failure_reason || ''}`) },
      { key: 'ip', label: 'IP address' },
    ],
  },
  users: {
    path: '/users', title: 'Users', searchPlaceholder: 'Search by name, email or phone',
    filters: [{ key: 'role', label: 'Role', options: Object.entries(roleLabel).map(([value, label]) => ({ value, label })) }],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'role', label: 'Role', render: (r) => roleLabel[r.role] || r.role },
      { key: 'business_name', label: 'Business' },
      { key: 'auth_provider', label: 'Sign-in', render: (r) => <Badge tone={r.auth_provider === 'google' ? 'indigo' : 'slate'}>{r.auth_provider || 'password'}</Badge> },
      { key: 'login_count', label: 'Logins', align: 'right' },
      { key: 'last_login_at', label: 'Last login', render: (r) => fmtDate(r.last_login_at), csv: (r) => r.last_login_at },
      { key: 'created_at', label: 'Joined', render: (r) => fmtDate(r.created_at), csv: (r) => r.created_at },
    ],
  },
  buyers: {
    path: '/buyers', title: 'Buyers', searchPlaceholder: 'Search by name, email or phone',
    columns: [
      { key: 'name', label: 'Buyer' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'business_name', label: 'Store' },
      { key: 'total_orders', label: 'Orders', align: 'right' },
      { key: 'total_spent', label: 'Total spent', align: 'right', render: (r) => fmtMoney(r.total_spent), csv: (r) => r.total_spent },
      { key: 'last_order_at', label: 'Last order', render: (r) => fmtDate(r.last_order_at), csv: (r) => r.last_order_at },
    ],
  },
  businesses: {
    path: '/businesses', title: 'Businesses', searchPlaceholder: 'Search by business name or email',
    columns: [
      { key: 'name', label: 'Business', render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-[10px] text-slate-500">{r.category}</div></div>, csv: (r) => r.name },
      { key: 'owner_name', label: 'Owner', render: (r) => <div><div>{r.owner_name || '—'}</div><div className="text-[10px] text-slate-500">{r.owner_email || ''}</div></div>, csv: (r) => `${r.owner_name || ''} <${r.owner_email || ''}>` },
      { key: 'assistant_name', label: 'Assistant' },
      { key: 'team_size', label: 'Team', align: 'right' },
      { key: 'products', label: 'Products', align: 'right' },
      { key: 'buyers', label: 'Buyers', align: 'right' },
      { key: 'orders', label: 'Orders', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtMoney(r.revenue), csv: (r) => r.revenue },
      { key: 'created_at', label: 'Registered', render: (r) => fmtDate(r.created_at), csv: (r) => r.created_at },
    ],
  },
  orders: {
    path: '/orders', title: 'Orders', searchPlaceholder: 'Search by order number or buyer',
    filters: [{ key: 'status', label: 'Status', options: ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].map((s) => ({ value: s, label: s })) }],
    columns: [
      { key: 'order_number', label: 'Order' },
      { key: 'created_at', label: 'Placed', render: (r) => fmtDate(r.created_at), csv: (r) => r.created_at },
      { key: 'customer_name', label: 'Buyer' },
      { key: 'business_name', label: 'Store' },
      { key: 'order_status', label: 'Status', render: (r) => <Badge tone={r.order_status === 'Cancelled' ? 'red' : r.order_status === 'Delivered' ? 'green' : 'slate'}>{r.order_status}</Badge> },
      { key: 'payment_status', label: 'Payment' },
      { key: 'total_amount', label: 'Total', align: 'right', render: (r) => fmtMoney(r.total_amount), csv: (r) => r.total_amount },
    ],
  },
};

// ---------------------------------------------------------------------------
// Portal shell
// ---------------------------------------------------------------------------
export const SuperAdminPortal: React.FC = () => {
  const [signedIn, setSignedIn] = useState<boolean>(!!saToken.get());
  const [tab, setTab] = useState<Tab>('overview');
  const [includeDemo, setIncludeDemo] = useState(false);

  const signOut = useCallback(() => { saToken.clear(); setSignedIn(false); }, []);
  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25"><Store className="w-5 h-5 text-white" /></div>
            <div className="leading-tight">
              <div className="font-bold tracking-tight">ShopMate <span className="text-indigo-400">AI</span></div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Super Admin Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} className="accent-indigo-500" />
              Include demo data
            </label>
            <button onClick={signOut} className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-rose-300 hover:bg-slate-800 flex items-center gap-1.5 transition"><LogOut className="w-4 h-4" />Sign out</button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`px-3.5 py-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${tab === t.id ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        <h1 className="text-xl font-black tracking-tight">{TABS.find((t) => t.id === tab)?.label}</h1>
        {tab === 'overview'
          ? <Overview includeDemo={includeDemo} onAuthError={signOut} />
          : <DataTable key={tab + String(includeDemo)} {...TABLES[tab]} includeDemo={includeDemo} onAuthError={signOut} />}
      </main>
    </div>
  );
};
