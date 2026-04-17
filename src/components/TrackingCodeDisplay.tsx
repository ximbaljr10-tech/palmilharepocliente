import React, { useState, useCallback } from 'react';
import { Copy, CheckCircle2, Truck, ExternalLink } from 'lucide-react';

interface TrackingCodeDisplayProps {
  trackingCode: string;
  /** 'customer' = user-facing (bigger, friendlier) | 'admin' = compact admin view */
  variant?: 'customer' | 'admin';
}

/**
 * Reusable component for displaying a shipping tracking code with:
 * - One-click copy to clipboard
 * - "Rastrear pedido" button opening Correios in a new tab
 * - Clear instruction text for the user
 * - Mobile-friendly layout
 */
export default function TrackingCodeDisplay({ trackingCode, variant = 'customer' }: TrackingCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trackingCode);
    } catch {
      // Fallback for older browsers / insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = trackingCode;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [trackingCode]);

  const handleTrack = useCallback(() => {
    window.open('https://rastreamento.correios.com.br/', '_blank', 'noopener,noreferrer');
  }, []);

  // ─── ADMIN VARIANT (compact, inline) ───
  if (variant === 'admin') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Truck size={14} className="text-blue-500 shrink-0" />
          <span className="text-zinc-600 text-sm">Rastreio:</span>
          <button
            onClick={handleCopy}
            className="font-mono font-bold text-blue-600 hover:text-blue-800 cursor-pointer transition-colors relative group"
            title="Clique para copiar"
          >
            {trackingCode}
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Clique para copiar
            </span>
          </button>
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-lg transition-all shrink-0 ${
              copied
                ? 'text-emerald-600 bg-emerald-50'
                : 'text-zinc-400 hover:text-blue-600 hover:bg-blue-50'
            }`}
            title={copied ? 'Copiado!' : 'Copiar codigo'}
          >
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          </button>
          <button
            onClick={handleTrack}
            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all shrink-0"
            title="Abrir site dos Correios"
          >
            <ExternalLink size={14} />
          </button>
        </div>
        {copied && (
          <p className="text-xs text-emerald-600 font-medium ml-6 animate-fade-in-fast">
            Codigo copiado! Cole no site dos Correios.
          </p>
        )}
      </div>
    );
  }

  // ─── CUSTOMER VARIANT (full, user-friendly) ───
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
      {/* Header with icon and tracking code */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Truck size={18} />
          </div>
          <div className="flex-grow min-w-0">
            <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Codigo de Rastreio</p>
          </div>
        </div>

        {/* Tracking code - clickable to copy */}
        <button
          onClick={handleCopy}
          className="w-full text-left bg-white border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 group hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer active:scale-[0.99]"
          title="Clique para copiar"
        >
          <code className="font-mono font-bold text-blue-800 text-base sm:text-lg flex-grow truncate select-all">
            {trackingCode}
          </code>
          <div className={`p-1.5 rounded-lg transition-all shrink-0 ${
            copied
              ? 'text-emerald-600 bg-emerald-100'
              : 'text-blue-400 group-hover:text-blue-600 group-hover:bg-blue-100'
          }`}>
            {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
          </div>
        </button>

        {/* Feedback message */}
        <div className="h-6 mt-1.5 flex items-center justify-center">
          {copied ? (
            <p className="text-xs text-emerald-600 font-semibold animate-fade-in-fast flex items-center gap-1">
              <CheckCircle2 size={12} /> Codigo copiado!
            </p>
          ) : (
            <p className="text-[11px] text-blue-400">
              Toque no codigo para copiar
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleCopy}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]'
            }`}
          >
            {copied ? (
              <>
                <CheckCircle2 size={16} />
                Copiado!
              </>
            ) : (
              <>
                <Copy size={16} />
                Copiar codigo
              </>
            )}
          </button>

          <button
            onClick={handleTrack}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 border-blue-300 text-blue-700 hover:bg-blue-100 hover:border-blue-400 active:scale-[0.98] transition-all"
          >
            <ExternalLink size={16} />
            Rastrear pedido
          </button>
        </div>
      </div>

      {/* Instruction footer */}
      <div className="bg-blue-100/60 border-t border-blue-200 px-4 py-2.5">
        <p className="text-[11px] sm:text-xs text-blue-600 text-center leading-relaxed">
          Copie o codigo acima e cole no site dos Correios para acompanhar seu pedido.
        </p>
      </div>
    </div>
  );
}
