import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ============================================================
// Auto-reload: mantém a aba do usuário sempre atualizada.
//
// Dois gatilhos, ambos com proteções para NÃO interromper checkout/PIX:
//
// 1) STALE-TAB RELOAD — quando o usuário volta à aba/app após ≥20 min
//    de ausência, recarregamos a rota atual para pegar deploys novos
//    e limpar estado "zumbi" (como o AdSense que recarrega a página
//    quando você volta depois de horas).
//
// 2) VERSION POLLING — a cada 15 min (aba visível), consultamos o
//    index.html do servidor e comparamos o hash do bundle JS.
//    Se mudou, ARMAMOS uma flag de "nova versão disponível" e fazemos
//    o reload apenas em um momento seguro (quando a aba volta a ficar
//    visível OU quando o usuário navega para uma rota que não é de
//    transação ativa).
//
// Proteções (NUNCA recarregar nesses casos):
//  - Tela de PIX do checkout (pedido criado, mostrando chave PIX) —
//    sinalizada via `window.__DDT_LOCK_RELOAD__ = true` pelo Checkout.
//  - URL contém /admin (painel operacional) — não atrapalhar o admin.
//  - URL é /store/checkout (formulário em preenchimento).
//  - Documento em estado de input ativo em campo crítico (melhor UX).
//
// Reload loop protection: sessionStorage guarda `ddt_reloadedAt`;
// pulamos reloads a < 10 s de distância do último.
//
// Sinais suportados (globais no window):
//   window.__DDT_LOCK_RELOAD__  (boolean)  // Checkout.tsx seta durante PIX
//   window.__DDT_NEW_VERSION__  (boolean)  // set interno quando detecta update
// ============================================================

declare global {
  interface Window {
    __DDT_LOCK_RELOAD__?: boolean;
    __DDT_NEW_VERSION__?: boolean;
    __DDT_FORCE_RELOAD_CHECK__?: () => void; // útil para debug no console
  }
}

(function initAutoReload() {
  // ── Configuração ──────────────────────────────────────────
  const ABSENCE_THRESHOLD_MS = 20 * 60 * 1000;     // 20 min
  const VERSION_POLL_MS      = 15 * 60 * 1000;     // 15 min
  const RELOAD_LOOP_WINDOW   = 10 * 1000;          // 10 s
  const SS_HIDDEN_KEY        = 'ddt_lastHiddenTime';
  const SS_RELOADED_KEY      = 'ddt_reloadedAt';
  const SS_INITIAL_VERSION   = 'ddt_initialBuildHash';

  // ── Utilitárias ───────────────────────────────────────────
  function safeGet(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  function safeSet(key: string, v: string): void {
    try { sessionStorage.setItem(key, v); } catch {}
  }
  function safeDel(key: string): void {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function wasJustReloaded(): boolean {
    const ts = safeGet(SS_RELOADED_KEY);
    if (!ts) return false;
    const diff = Date.now() - Number(ts);
    return !isNaN(diff) && diff < RELOAD_LOOP_WINDOW;
  }

  function markReloaded(): void {
    safeSet(SS_RELOADED_KEY, String(Date.now()));
  }

  /**
   * Decide se é seguro recarregar a página agora.
   * Bloqueia em contextos transacionais críticos.
   */
  function isSafeToReload(): boolean {
    try {
      // Lock global (Checkout na tela de PIX, por exemplo)
      if (window.__DDT_LOCK_RELOAD__) return false;

      const path = window.location.pathname || '';

      // Admin: não atrapalhar quem está trabalhando
      if (path.includes('/admin')) return false;

      // Checkout aberto (formulário ou pix)
      if (path.includes('/checkout')) return false;

      // Se tem um campo de texto com conteúdo focado, melhor não reload
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
          // Só evita se o campo tem valor (digitando algo)
          const val = (active as HTMLInputElement).value;
          if (val && val.length > 0) return false;
        }
      }

      return true;
    } catch {
      // Em caso de erro inesperado, seja conservador
      return false;
    }
  }

  function performReload(reason: string): void {
    if (wasJustReloaded()) return;
    if (!isSafeToReload()) {
      // Marca que existe intenção de reload; tentará de novo depois
      window.__DDT_NEW_VERSION__ = true;
      return;
    }
    markReloaded();
    // Limpa cache do document antes de reload (hard reload não é mais
    // possível via JS moderna, mas o index.html já tem Cache-Control:
    // no-cache no Nginx, então location.reload() basta).
    // eslint-disable-next-line no-console
    console.info(`[auto-reload] reason=${reason}`);
    window.location.reload();
  }

  // ── 1) Stale-tab reload (visibilitychange + bfcache pageshow) ──
  function onHidden(): void {
    safeSet(SS_HIDDEN_KEY, String(Date.now()));
  }

  function onVisible(): void {
    // 1a) Se há nova versão pendente, tenta aplicar agora
    if (window.__DDT_NEW_VERSION__ && isSafeToReload()) {
      performReload('new-version-on-visible');
      return;
    }

    // 1b) Verifica ausência ≥ threshold
    const raw = safeGet(SS_HIDDEN_KEY);
    if (!raw) return;
    const elapsed = Date.now() - Number(raw);
    if (isNaN(elapsed) || elapsed < ABSENCE_THRESHOLD_MS) return;

    safeDel(SS_HIDDEN_KEY);
    performReload('stale-tab-absence');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHidden();
    else if (document.visibilityState === 'visible') onVisible();
  });

  window.addEventListener('pageshow', (e: PageTransitionEvent) => {
    if (e.persisted) onVisible(); // restauração via bfcache (Safari/iOS)
  });

  if (document.visibilityState === 'hidden') onHidden();

  // ── 2) Version polling ─────────────────────────────────────
  //
  // Lê o index.html atual do servidor e extrai o hash do bundle JS
  // (ex: /assets/index-BdmKVD1k.js). Se mudou vs. o hash gravado
  // na primeira carga da sessão, marca flag de nova versão.
  //
  // Usa cache: 'no-store' + timestamp para furar qualquer cache.
  // ───────────────────────────────────────────────────────────

  function extractBundleHash(html: string): string | null {
    // Procura por /assets/index-XXXX.js (primeiro match)
    const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    return m ? m[0] : null;
  }

  async function fetchServerBundleHash(): Promise<string | null> {
    try {
      const res = await fetch(`/index.html?_v=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      });
      if (!res.ok) return null;
      const text = await res.text();
      return extractBundleHash(text);
    } catch {
      return null;
    }
  }

  function getCurrentBundleHash(): string | null {
    // O próprio HTML que carregou essa aba contém o hash atual
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    for (const s of scripts) {
      const src = (s as HTMLScriptElement).src || '';
      const m = src.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
      if (m) return m[0];
    }
    return null;
  }

  // Grava o hash inicial desta sessão apenas uma vez
  (function seedInitialVersion() {
    if (!safeGet(SS_INITIAL_VERSION)) {
      const cur = getCurrentBundleHash();
      if (cur) safeSet(SS_INITIAL_VERSION, cur);
    }
  })();

  async function checkForNewVersion(): Promise<void> {
    // Só faz polling se a aba está visível (economiza rede/bateria)
    if (document.visibilityState !== 'visible') return;

    const initial = safeGet(SS_INITIAL_VERSION);
    if (!initial) return;

    const server = await fetchServerBundleHash();
    if (!server) return;

    if (server !== initial) {
      window.__DDT_NEW_VERSION__ = true;
      // Tenta aplicar já, se for seguro; senão vai aplicar no próximo visible
      performReload('new-version-detected');
    }
  }

  // Primeiro polling depois de 1 min (evita competir com cold start),
  // depois a cada VERSION_POLL_MS.
  setTimeout(() => {
    checkForNewVersion();
    setInterval(checkForNewVersion, VERSION_POLL_MS);
  }, 60 * 1000);

  // Helper de debug: força checagem imediata pelo console
  window.__DDT_FORCE_RELOAD_CHECK__ = () => { checkForNewVersion(); };
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
