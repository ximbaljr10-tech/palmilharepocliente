import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ============================================================
// Stale-tab reload: when the user returns to the site/tab/app
// after a relevant absence (≥20 min), reload the CURRENT route
// once to pick up new deploys and clear zombie state.
//
// - Uses sessionStorage so the timestamp survives Android/iOS
//   killing the JS context while the tab is backgrounded.
// - Uses visibilitychange + pageshow (bfcache) events.
// - Does NOT reload on normal SPA navigation.
// - Protected against reload loops.
// ============================================================
(function initStaleTabReload() {
  var ABSENCE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes
  var SS_HIDDEN_KEY = 'ddt_lastHiddenTime';
  var SS_RELOADED_KEY = 'ddt_reloadedAt';

  // Prevent reload loops: if we just reloaded within the last 10 s, skip.
  function wasJustReloaded(): boolean {
    try {
      var ts = sessionStorage.getItem(SS_RELOADED_KEY);
      if (ts && Date.now() - Number(ts) < 10000) return true;
    } catch {}
    return false;
  }

  function markReloaded(): void {
    try { sessionStorage.setItem(SS_RELOADED_KEY, String(Date.now())); } catch {}
  }

  function onHidden(): void {
    try { sessionStorage.setItem(SS_HIDDEN_KEY, String(Date.now())); } catch {}
  }

  function onVisible(): void {
    try {
      var raw = sessionStorage.getItem(SS_HIDDEN_KEY);
      if (!raw) return;
      var elapsed = Date.now() - Number(raw);
      if (isNaN(elapsed) || elapsed < ABSENCE_THRESHOLD_MS) return;
      // Clear the key BEFORE reloading to prevent loops
      sessionStorage.removeItem(SS_HIDDEN_KEY);
      if (wasJustReloaded()) return;
      markReloaded();
      // Reload the current route (not redirect to home)
      window.location.reload();
    } catch {}
  }

  // visibilitychange: standard API for tab hide/show
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      onHidden();
    } else if (document.visibilityState === 'visible') {
      onVisible();
    }
  });

  // pageshow: catches bfcache restoration (Safari/iOS)
  window.addEventListener('pageshow', function (e: PageTransitionEvent) {
    if (e.persisted) {
      // Page was restored from bfcache — treat as a return
      onVisible();
    }
  });

  // Set initial hidden timestamp if page loads already hidden (prerender)
  if (document.visibilityState === 'hidden') {
    onHidden();
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
