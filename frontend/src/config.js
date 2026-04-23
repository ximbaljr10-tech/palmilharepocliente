/**
 * Configuração central do frontend.
 *
 * A URL do backend fica HARDCODED aqui para garantir que o build do Vercel
 * funcione mesmo sem env vars configuradas. Se um dia você mudar o backend
 * de servidor, é só editar esta constante e fazer um novo deploy.
 *
 * Ordem de precedência:
 *   1. process.env.REACT_APP_BACKEND_URL (se definida no build)
 *   2. BACKEND_URL_FALLBACK abaixo (valor padrão gravado no bundle)
 */

// ⚠️ ATENÇÃO: se você mudar o hostname do backend, atualize aqui e refaça o build/deploy.
const BACKEND_URL_FALLBACK = "https://api.91-98-154-218.sslip.io";

export const BACKEND_URL =
  (process.env.REACT_APP_BACKEND_URL && process.env.REACT_APP_BACKEND_URL.trim()) ||
  BACKEND_URL_FALLBACK;

// Helper para montar endpoints (evita barras duplicadas).
export const api = (path) => {
  const base = BACKEND_URL.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
};
