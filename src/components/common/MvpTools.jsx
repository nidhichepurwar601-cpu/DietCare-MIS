import React from "react";
import { X, Download, LoaderCircle, RefreshCw, AlertTriangle, SearchX } from "lucide-react";

export function Modal({ title, children, onClose, wide=false, noScroll=false }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4">
      <div className={`max-h-[92vh] w-full ${wide ? "max-w-6xl" : "max-w-2xl"} ${noScroll ? "overflow-hidden" : "overflow-y-auto"} rounded-xl border border-gray-300 bg-white shadow-2xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-3">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={19}/></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message, type="success", onClose }) {
  if (!message) return null;
  return <div className={`fixed right-5 top-5 z-[200] rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${type==="error"?"bg-red-600":"bg-emerald-700"}`}>
    <div className="flex items-center gap-3"><span>{message}</span><button onClick={onClose}>×</button></div>
  </div>;
}

export function exportCsv(filename, rows) {
  if (!rows?.length) return false;
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = v => `"${String(v ?? "").replaceAll('"','""')}"`;
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url); return true;
}

export function EmptyState({ text="No records found", hint="", actionLabel="", onAction }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <SearchX size={24} className="text-slate-400" />
      <div className="text-sm font-semibold text-slate-700">{text}</div>
      {hint && <div className="max-w-md text-xs text-slate-500">{hint}</div>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={13} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

export function LoadingState({ text="Loading..." }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500" role="status" aria-live="polite">
      <LoaderCircle size={18} className="animate-spin" /> {text}
    </div>
  );
}

export function ErrorState({ text="Something went wrong.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <AlertTriangle size={22} className="text-red-600" />
      <div className="text-sm font-semibold text-red-800">{text}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}
