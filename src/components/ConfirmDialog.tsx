import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small accessible confirmation modal used before any destructive action. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, confirmLabel = 'Delete', busy, busyLabel = 'Working...', error, onConfirm, onCancel }) => (
  <div
    className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    onKeyDown={(e) => e.key === 'Escape' && !busy && onCancel()}
  >
    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4 text-white">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-rose-950 border border-rose-800 shrink-0">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
        </div>
        <div className="space-y-1">
          <h2 id="confirm-title" className="font-bold text-sm">{title}</h2>
          <div className="text-xs text-slate-400 leading-relaxed">{message}</div>
        </div>
      </div>
      {error && <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-xs">{error}</div>}
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" autoFocus onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{busy ? busyLabel : confirmLabel}</span>
        </button>
      </div>
    </div>
  </div>
);
