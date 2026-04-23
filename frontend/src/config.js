/**
 * Configuração central do frontend — URL do backend HARDCODED.
 *
 * Aqui a URL é FIXA no código. Não lemos mais de process.env.REACT_APP_BACKEND_URL
 * porque qualquer .env deixado no projeto acabava substituindo durante o build
 * do Vercel (e quebrava com "localhost:8001" em produção).
 *
 * Para mudar o backend: edite BACKEND_URL abaixo e faça um novo commit.
 */

export const BACKEND_URL = "https://api.91-98-154-218.sslip.io";

/** Monta um endpoint: api('/api/auth/login') -> 'https://.../api/auth/login' */
export const api = (path) => {
  const base = BACKEND_URL.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
};
