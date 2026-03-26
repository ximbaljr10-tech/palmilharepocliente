import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MEDUSA_URL } from './adminApi';
import {
  Mail, Inbox, Send, RefreshCw, ArrowLeft, Reply, Loader2,
  Paperclip, ChevronLeft, ChevronRight, AlertCircle, X,
  CheckCircle2, Edit3, Trash2, Archive, File, Clock,
  MailOpen
} from 'lucide-react';

// =====================================================================
// TYPES
// =====================================================================
type EmailSummary = {
  uid: number;
  seq: number;
  flags: string[];
  seen: boolean;
  subject: string;
  from: { name: string; address: string }[];
  to: { name: string; address: string }[];
  date: string | null;
  messageId: string | null;
  hasAttachments: boolean;
};

type EmailFull = {
  uid: number;
  flags: string[];
  subject: string;
  from: { name: string; address: string }[];
  to: { name: string; address: string }[];
  cc: { name: string; address: string }[];
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  html: string | null;
  text: string | null;
  attachments: { filename: string; contentType: string; size: number }[];
};

type FolderInfo = {
  name: string;
  path: string;
  specialUse: string | null;
};

type ComposeMode = 'none' | 'new' | 'reply';

// =====================================================================
// PERSISTENT CACHE (survives unmounts, smart TTL)
// =====================================================================
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const emailListCache = new Map<string, { emails: EmailSummary[]; total: number; pages: number; ts: number }>();
const emailBodyCache = new Map<string, { email: EmailFull; ts: number }>();
let folderCacheData: { folders: FolderInfo[]; ts: number } = { folders: [], ts: 0 };

// Persist selected folder and last open email across navigations
const STATE_KEY_FOLDER = 'admin_email_folder';
const STATE_KEY_LAST_UID = 'admin_email_last_uid';
const STATE_KEY_LAST_PAGE = 'admin_email_last_page';

function getCachedFolder(): string {
  return localStorage.getItem(STATE_KEY_FOLDER) || 'INBOX';
}
function setCachedFolder(f: string) {
  localStorage.setItem(STATE_KEY_FOLDER, f);
}
function getCachedPage(): number {
  return parseInt(localStorage.getItem(STATE_KEY_LAST_PAGE) || '1') || 1;
}
function setCachedPage(p: number) {
  localStorage.setItem(STATE_KEY_LAST_PAGE, String(p));
}
function getCachedUid(): number | null {
  const v = localStorage.getItem(STATE_KEY_LAST_UID);
  return v ? parseInt(v) || null : null;
}
function setCachedUid(uid: number | null) {
  if (uid) localStorage.setItem(STATE_KEY_LAST_UID, String(uid));
  else localStorage.removeItem(STATE_KEY_LAST_UID);
}

// =====================================================================
// HELPERS
// =====================================================================
function formatEmailDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
}

function senderDisplay(people: { name: string; address: string }[]): string {
  if (!people || !people.length) return 'Desconhecido';
  const p = people[0];
  return p.name || p.address.split('@')[0];
}

function senderInitial(people: { name: string; address: string }[]): string {
  if (!people || !people.length) return '?';
  const p = people[0];
  const name = p.name || p.address;
  return name.charAt(0).toUpperCase();
}

function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '');
}

const FOLDER_LABELS: Record<string, string> = {
  'INBOX': 'Recebidos',
  'Sent': 'Enviados',
  'Drafts': 'Rascunhos',
  'Trash': 'Lixeira',
  'Archive': 'Arquivo',
  'Junk': 'Spam',
};

const FOLDER_ICONS: Record<string, any> = {
  '\\Inbox': Inbox,
  '\\Sent': Send,
  '\\Drafts': File,
  '\\Trash': Trash2,
  '\\Archive': Archive,
  '\\Junk': AlertCircle,
};

function folderLabel(f: FolderInfo): string {
  return FOLDER_LABELS[f.name] || f.name;
}

function folderIcon(f: FolderInfo): any {
  if (f.specialUse && FOLDER_ICONS[f.specialUse]) return FOLDER_ICONS[f.specialUse];
  const lower = f.name.toLowerCase();
  if (lower === 'sent') return Send;
  if (lower === 'archive') return Archive;
  if (lower === 'drafts') return File;
  if (lower === 'trash') return Trash2;
  if (lower === 'junk' || lower === 'spam') return AlertCircle;
  return Mail;
}

// =====================================================================
// API LAYER
// =====================================================================
async function emailFetch(path: string) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');
  const res = await fetch(`${MEDUSA_URL}/admin/email${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Sessao expirada');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function emailPost(body: any) {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`${MEDUSA_URL}/admin/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function AdminEmailInbox() {
  // --- Folder state ---
  const [folders, setFolders] = useState<FolderInfo[]>(folderCacheData.folders);
  const [activeFolder, setActiveFolder] = useState<string>(getCachedFolder);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- Email list state ---
  const [emails, setEmails] = useState<EmailSummary[]>(() => {
    const cached = emailListCache.get(`${getCachedFolder()}-${getCachedPage()}`);
    return cached ? cached.emails : [];
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState<number>(getCachedPage);
  const [pages, setPages] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // --- Email read state ---
  const [currentEmail, setCurrentEmail] = useState<EmailFull | null>(null);
  const [currentUid, setCurrentUid] = useState<number | null>(getCachedUid);
  const [loadingEmail, setLoadingEmail] = useState(false);

  // --- Compose state ---
  const [composeMode, setComposeMode] = useState<ComposeMode>('none');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeReplyTo, setComposeReplyTo] = useState<string | null>(null);
  const [composeReferences, setComposeReferences] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // --- Refs ---
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // --- Derived ---
  const activeFolderObj = useMemo(
    () => folders.find(f => f.path === activeFolder) || { name: activeFolder, path: activeFolder, specialUse: null },
    [folders, activeFolder]
  );
  const isSentFolder = activeFolderObj.specialUse === '\\Sent' || activeFolderObj.name.toLowerCase() === 'sent';

  // =====================================================================
  // LOAD FOLDERS (on mount, with cache)
  // =====================================================================
  useEffect(() => {
    async function loadFolders() {
      const now = Date.now();
      if (folderCacheData.folders.length > 0 && (now - folderCacheData.ts) < CACHE_TTL) {
        setFolders(folderCacheData.folders);
        return;
      }
      try {
        const res = await emailFetch('?action=folders');
        if (res.success && res.folders) {
          // Sort: Inbox first, then Sent, then rest alphabetically
          const priority = ['\\Inbox', '\\Sent', '\\Drafts', '\\Trash', '\\Archive', '\\Junk'];
          const sorted = [...res.folders].sort((a: FolderInfo, b: FolderInfo) => {
            const ai = priority.indexOf(a.specialUse || '');
            const bi = priority.indexOf(b.specialUse || '');
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            // Sort INBOX and Sent to top by name too
            if (a.name === 'INBOX') return -1;
            if (b.name === 'INBOX') return 1;
            if (a.name.toLowerCase() === 'sent') return -1;
            if (b.name.toLowerCase() === 'sent') return 1;
            return a.name.localeCompare(b.name);
          });
          setFolders(sorted);
          folderCacheData = { folders: sorted, ts: now };
        }
      } catch (e: any) {
        console.error('Failed to load folders:', e.message);
      }
    }
    loadFolders();
  }, []);

  // =====================================================================
  // LOAD EMAIL LIST (with smart caching)
  // =====================================================================
  const loadEmails = useCallback(async (folderPath: string, pageNum: number, forceRefresh = false) => {
    const cacheKey = `${folderPath}-${pageNum}`;
    const cached = emailListCache.get(cacheKey);
    const now = Date.now();

    // Use cache immediately if valid and not forcing refresh
    if (cached && !forceRefresh && (now - cached.ts) < CACHE_TTL) {
      setEmails(cached.emails);
      setTotal(cached.total);
      setPages(cached.pages);
      setLoadingList(false);
      setListError(null);
      return;
    }

    // Show cached data while fetching fresh data (stale-while-revalidate)
    if (cached && !forceRefresh) {
      setEmails(cached.emails);
      setTotal(cached.total);
      setPages(cached.pages);
    }

    setLoadingList(true);
    setListError(null);

    try {
      const data = await emailFetch(`?folder=${encodeURIComponent(folderPath)}&page=${pageNum}&limit=30`);
      if (data.success) {
        setEmails(data.emails);
        setTotal(data.total);
        setPages(data.pages);
        emailListCache.set(cacheKey, {
          emails: data.emails,
          total: data.total,
          pages: data.pages,
          ts: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('[EMAIL LIST]', err.message);
      // Only show error if we have no cached data
      if (!cached) {
        setListError(err.message);
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Load emails when folder or page changes
  useEffect(() => {
    setCachedFolder(activeFolder);
    setCachedPage(page);
    loadEmails(activeFolder, page, false);
  }, [activeFolder, page, loadEmails]);

  // =====================================================================
  // OPEN EMAIL
  // =====================================================================
  const handleOpenEmail = useCallback(async (uid: number) => {
    // If same email, just show it
    if (currentEmail?.uid === uid && composeMode === 'none') return;

    setComposeMode('none');
    setCurrentUid(uid);
    setCachedUid(uid);

    // Check body cache
    const bodyKey = `${activeFolder}-${uid}`;
    const cached = emailBodyCache.get(bodyKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      setCurrentEmail(cached.email);
      // Mark as read in list
      setEmails(prev => prev.map(e => e.uid === uid ? { ...e, seen: true } : e));
      return;
    }

    setLoadingEmail(true);
    setCurrentEmail(null);

    try {
      const data = await emailFetch(`?action=read&uid=${uid}&folder=${encodeURIComponent(activeFolder)}`);
      if (data.success && data.email) {
        setCurrentEmail(data.email);
        emailBodyCache.set(bodyKey, { email: data.email, ts: Date.now() });

        // Mark read in local list state + cache
        setEmails(prev => {
          const next = prev.map(e => e.uid === uid ? { ...e, seen: true } : e);
          const cacheKey = `${activeFolder}-${page}`;
          const listCached = emailListCache.get(cacheKey);
          if (listCached) emailListCache.set(cacheKey, { ...listCached, emails: next });
          return next;
        });
      }
    } catch (err: any) {
      console.error('[EMAIL READ]', err.message);
    }
    setLoadingEmail(false);
  }, [activeFolder, currentEmail, composeMode, page]);

  // =====================================================================
  // COMPOSE / REPLY
  // =====================================================================
  const startCompose = useCallback(() => {
    setCurrentEmail(null);
    setCurrentUid(null);
    setCachedUid(null);
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setComposeReplyTo(null);
    setComposeReferences(null);
    setSendResult(null);
    setComposeMode('new');
    setSidebarOpen(false);
  }, []);

  const startReply = useCallback(() => {
    if (!currentEmail) return;
    const from = currentEmail.from[0];
    setComposeTo(from?.address || '');
    setComposeSubject(
      currentEmail.subject.startsWith('Re:') ? currentEmail.subject : `Re: ${currentEmail.subject}`
    );
    setComposeReplyTo(currentEmail.messageId);
    setComposeReferences(
      currentEmail.references
        ? `${currentEmail.references} ${currentEmail.messageId}`
        : currentEmail.messageId
    );
    const quoteDate = formatFullDate(currentEmail.date);
    const quoteSender = senderDisplay(currentEmail.from);
    const quoteText = currentEmail.text || '';
    const quotedLines = quoteText.split('\n').map(l => `> ${l}`).join('\n');
    setComposeBody(`\n\n--- Em ${quoteDate}, ${quoteSender} escreveu ---\n${quotedLines}`);
    setSendResult(null);
    setComposeMode('reply');
  }, [currentEmail]);

  // Focus management for compose/reply
  useEffect(() => {
    if (composeMode === 'none') return;
    const timer = setTimeout(() => {
      if (composeMode === 'reply') {
        // Reply: focus on body, cursor at start
        bodyTextareaRef.current?.focus();
        bodyTextareaRef.current?.setSelectionRange(0, 0);
      } else if (composeMode === 'new') {
        // New: focus on "To" field
        toInputRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [composeMode]);

  const handleSend = useCallback(async () => {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const data = await emailPost({
        to: composeTo.trim(),
        subject: composeSubject.trim(),
        text: composeBody,
        inReplyTo: composeReplyTo,
        references: composeReferences,
      });
      if (data.success) {
        setSendResult({ success: true, message: 'Email enviado com sucesso!' });
        // Invalidate Sent folder cache
        for (const [key] of emailListCache) {
          if (key.toLowerCase().includes('sent')) emailListCache.delete(key);
        }
        setTimeout(() => {
          setComposeMode('none');
          setSendResult(null);
          // If in Sent folder, reload
          if (isSentFolder) loadEmails(activeFolder, page, true);
        }, 1500);
      } else {
        setSendResult({ success: false, message: data.error || 'Erro ao enviar' });
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err.message });
    }
    setSending(false);
  }, [composeTo, composeSubject, composeBody, composeReplyTo, composeReferences, isSentFolder, activeFolder, page, loadEmails]);

  const cancelCompose = useCallback(() => {
    setComposeMode('none');
    setSendResult(null);
  }, []);

  // =====================================================================
  // IFRAME RENDERING
  // =====================================================================
  useEffect(() => {
    if (!currentEmail || composeMode !== 'none' || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    const content = currentEmail.html
      ? sanitizeEmailHtml(currentEmail.html)
      : `<pre style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;color:#374151;margin:0;">${(currentEmail.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size: 14px; color: #1f2937; margin: 0; padding: 16px; line-height: 1.6; word-break: break-word; }
    img { max-width: 100%; height: auto; }
    a { color: #2563eb; }
    a:hover { text-decoration: underline; }
    pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; }
    blockquote { border-left: 3px solid #e5e7eb; margin: 8px 0; padding-left: 12px; color: #6b7280; }
    table { max-width: 100%; }
  </style>
</head><body>${content}</body></html>`);
    doc.close();

    // Auto-resize iframe
    const resize = () => {
      if (iframeRef.current?.contentDocument?.body) {
        const h = iframeRef.current.contentDocument.body.scrollHeight;
        iframeRef.current.style.height = Math.max(200, h + 32) + 'px';
      }
    };
    setTimeout(resize, 150);
    setTimeout(resize, 500); // Second pass for images
  }, [currentEmail, composeMode]);

  // =====================================================================
  // SIDEBAR: close on click outside, ESC key
  // =====================================================================
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [sidebarOpen]);

  // =====================================================================
  // FOLDER CHANGE
  // =====================================================================
  const handleFolderChange = useCallback((folderPath: string) => {
    if (folderPath === activeFolder) {
      setSidebarOpen(false);
      return;
    }
    setActiveFolder(folderPath);
    setPage(1);
    setCurrentEmail(null);
    setCurrentUid(null);
    setCachedUid(null);
    setComposeMode('none');
    setSidebarOpen(false);
  }, [activeFolder]);

  // =====================================================================
  // BACK TO LIST (mobile)
  // =====================================================================
  const handleBackToList = useCallback(() => {
    setCurrentEmail(null);
    setCurrentUid(null);
    setCachedUid(null);
    setComposeMode('none');
  }, []);

  // =====================================================================
  // RENDER: SIDEBAR
  // =====================================================================
  const renderSidebar = () => (
    <div
      ref={sidebarRef}
      className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 absolute lg:relative z-30 w-60 h-full bg-zinc-50 border-r border-zinc-200 flex flex-col transition-transform duration-200 ease-in-out`}
    >
      {/* Close button on mobile */}
      <div className="flex items-center justify-between p-3 lg:hidden border-b border-zinc-100">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Pastas</span>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Compose button */}
      <div className="p-3">
        <button
          onClick={startCompose}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm"
        >
          <Edit3 size={15} />
          Escrever
        </button>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-1">
        {folders.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Loader2 size={18} className="animate-spin text-zinc-300 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">Carregando pastas...</p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {folders.map(f => {
              const Icon = folderIcon(f);
              const isActive = activeFolder === f.path;
              const label = folderLabel(f);
              return (
                <button
                  key={f.path}
                  onClick={() => handleFolderChange(f.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-blue-500' : 'text-zinc-400'} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // =====================================================================
  // RENDER: EMAIL LIST
  // =====================================================================
  const renderEmailList = () => {
    const isNarrow = !!(currentEmail || composeMode !== 'none');

    return (
      <div className={`flex flex-col border-r border-zinc-200 bg-white transition-all duration-200 ${
        isNarrow ? 'hidden lg:flex lg:w-[320px] xl:w-[380px]' : 'w-full lg:w-[320px] xl:w-[380px]'
      }`}>
        {/* List header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-white/90 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
              aria-label="Abrir pastas"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-bold text-zinc-900 truncate text-sm">
              {folderLabel(activeFolderObj)}
            </h2>
            {total > 0 && (
              <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 px-1.5 py-0.5 rounded-full">
                {total}
              </span>
            )}
          </div>
          <button
            onClick={() => loadEmails(activeFolder, page, true)}
            disabled={loadingList}
            className="p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 rounded-lg transition-colors disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw size={15} className={loadingList ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>

        {/* Email items */}
        <div className="flex-1 overflow-y-auto">
          {listError && emails.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle size={24} className="mx-auto mb-3 text-red-300" />
              <p className="text-sm text-red-600 font-medium mb-1">Erro ao carregar</p>
              <p className="text-xs text-zinc-400 mb-3">{listError}</p>
              <button
                onClick={() => loadEmails(activeFolder, page, true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Tentar novamente
              </button>
            </div>
          ) : emails.length === 0 && !loadingList ? (
            <div className="p-12 text-center">
              <MailOpen size={32} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-medium text-zinc-400">
                {isSentFolder ? 'Nenhum email enviado' : 'Nenhuma mensagem'}
              </p>
              <p className="text-xs text-zinc-300 mt-1">
                {isSentFolder ? 'Emails enviados aparecerao aqui' : 'A caixa esta vazia'}
              </p>
            </div>
          ) : emails.length === 0 && loadingList ? (
            <div className="p-8 text-center">
              <Loader2 size={22} className="animate-spin text-blue-400 mx-auto mb-3" />
              <p className="text-xs text-zinc-400">Carregando mensagens...</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {emails.map(email => {
                const isActive = currentUid === email.uid;
                const showTo = isSentFolder;
                const people = showTo ? email.to : email.from;
                const isUnread = !email.seen;

                return (
                  <button
                    key={email.uid}
                    onClick={() => handleOpenEmail(email.uid)}
                    className={`w-full text-left px-4 py-3 transition-all relative group ${
                      isActive
                        ? 'bg-blue-50/80'
                        : isUnread
                          ? 'bg-white hover:bg-zinc-50'
                          : 'bg-white hover:bg-zinc-50/80'
                    }`}
                  >
                    {/* Unread indicator */}
                    {isUnread && !isActive && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500" />
                    )}

                    <div className="pl-2">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-sm truncate ${isUnread ? 'font-bold text-zinc-900' : 'font-medium text-zinc-600'}`}>
                          {showTo ? 'Para: ' : ''}{senderDisplay(people)}
                        </span>
                        <span className={`text-[10px] whitespace-nowrap flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-zinc-400'}`}>
                          {formatEmailDate(email.date)}
                        </span>
                      </div>
                      <p className={`text-xs truncate ${isUnread ? 'font-semibold text-zinc-800' : 'text-zinc-500'}`}>
                        {email.subject || '(sem assunto)'}
                      </p>
                      {email.hasAttachments && (
                        <div className="flex items-center gap-1 mt-1">
                          <Paperclip size={10} className="text-zinc-400" />
                          <span className="text-[10px] text-zinc-400">Anexo</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Loading indicator at bottom for refresh */}
              {loadingList && emails.length > 0 && (
                <div className="py-2 text-center">
                  <Loader2 size={14} className="animate-spin text-blue-400 mx-auto" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100 bg-white">
            <span className="text-[10px] text-zinc-400 font-medium">
              Pagina {page} de {pages} ({total} emails)
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // =====================================================================
  // RENDER: COMPOSE / REPLY PANEL
  // =====================================================================
  const renderCompose = () => {
    if (composeMode === 'none') return null;
    const isReply = composeMode === 'reply';

    return (
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 bg-white">
          <button
            onClick={cancelCompose}
            className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <h3 className="font-bold text-zinc-900 text-sm">
            {isReply ? 'Responder' : 'Nova Mensagem'}
          </h3>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-5 space-y-4">
            {/* To field */}
            <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide w-12 flex-shrink-0">
                Para
              </label>
              {isReply ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm text-zinc-800 font-medium truncate">{composeTo}</span>
                  <button
                    onClick={() => {
                      // Allow editing if needed
                      const el = document.getElementById('compose-to-input');
                      if (el) {
                        (el as HTMLElement).style.display = 'block';
                        (el as HTMLInputElement).focus();
                      }
                    }}
                    className="text-[10px] text-blue-500 hover:text-blue-600 font-medium flex-shrink-0"
                  >
                    editar
                  </button>
                  <input
                    id="compose-to-input"
                    type="email"
                    value={composeTo}
                    onChange={e => setComposeTo(e.target.value)}
                    className="flex-1 text-sm text-zinc-800 bg-transparent border-none outline-none hidden"
                  />
                </div>
              ) : (
                <input
                  ref={toInputRef}
                  type="email"
                  value={composeTo}
                  onChange={e => setComposeTo(e.target.value)}
                  placeholder="destinatario@email.com"
                  className="flex-1 text-sm text-zinc-800 bg-transparent border-none outline-none placeholder:text-zinc-300"
                />
              )}
            </div>

            {/* Subject */}
            <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide w-12 flex-shrink-0">
                Assunto
              </label>
              <input
                type="text"
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder={isReply ? '' : 'Assunto da mensagem'}
                readOnly={isReply}
                className={`flex-1 text-sm bg-transparent border-none outline-none ${
                  isReply ? 'text-zinc-500 cursor-default' : 'text-zinc-800 placeholder:text-zinc-300'
                }`}
              />
            </div>

            {/* Body */}
            <div className="min-h-[250px]">
              <textarea
                ref={bodyTextareaRef}
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder={isReply ? '' : 'Escreva sua mensagem...'}
                className="w-full min-h-[250px] text-sm text-zinc-800 bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-zinc-300"
                style={{ height: 'auto', minHeight: '250px' }}
              />
            </div>

            {/* Send result */}
            {sendResult && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
                sendResult.success
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {sendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {sendResult.message}
              </div>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="border-t border-zinc-100 bg-white px-5 py-3 flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || !composeTo.trim() || !composeSubject.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Enviar
          </button>
          <button
            onClick={cancelCompose}
            className="px-4 py-2 text-zinc-500 font-medium hover:bg-zinc-100 rounded-xl text-sm transition-colors"
          >
            Descartar
          </button>
        </div>
      </div>
    );
  };

  // =====================================================================
  // RENDER: EMAIL READING PANEL
  // =====================================================================
  const renderReadingPane = () => {
    if (composeMode !== 'none') return null;

    // Loading state
    if (loadingEmail && !currentEmail) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/30">
          <Loader2 size={28} className="animate-spin mb-3 text-blue-400" />
          <p className="text-sm font-medium text-zinc-500">Abrindo mensagem...</p>
        </div>
      );
    }

    // Email content
    if (currentEmail) {
      return (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-white/90 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={handleBackToList}
                className="lg:hidden p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
                aria-label="Voltar"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                onClick={startReply}
                className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800 rounded-lg text-sm font-medium transition-colors"
              >
                <Reply size={15} />
                <span>Responder</span>
              </button>
            </div>
          </div>

          {/* Email content */}
          <div className="flex-1 overflow-y-auto">
            {/* Subject */}
            <div className="px-6 pt-5 pb-3">
              <h1 className="text-lg font-bold text-zinc-900 leading-snug">
                {currentEmail.subject || '(sem assunto)'}
              </h1>
            </div>

            {/* From/To header */}
            <div className="px-6 pb-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5">
                {senderInitial(currentEmail.from)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-zinc-900 text-sm">
                    {senderDisplay(currentEmail.from)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {'<'}{currentEmail.from[0]?.address}{'>'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                  <span>Para: {currentEmail.to.map(t => t.name || t.address).join(', ')}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1">
                  <Clock size={10} />
                  <span>{formatFullDate(currentEmail.date)}</span>
                </div>
              </div>
            </div>

            {/* Attachments */}
            {currentEmail.attachments.length > 0 && (
              <div className="px-6 py-3 mx-6 mb-3 bg-zinc-50 rounded-xl">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Paperclip size={10} />
                  {currentEmail.attachments.length} anexo{currentEmail.attachments.length > 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentEmail.attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-600 hover:border-blue-300 transition-colors">
                      <File size={12} className="text-blue-500 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">{att.filename}</span>
                      <span className="text-zinc-400 flex-shrink-0">({Math.round(att.size / 1024)}KB)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email body iframe */}
            <div className="px-6 pb-6">
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin allow-popups"
                className="w-full border-0"
                style={{ minHeight: '200px' }}
                title="Conteudo do email"
              />
            </div>

            {/* Quick reply at bottom */}
            <div className="px-6 pb-6">
              <button
                onClick={startReply}
                className="w-full flex items-center justify-center gap-2 py-3 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 transition-all"
              >
                <Reply size={15} />
                Responder a esta mensagem
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Empty state (no email selected)
    return (
      <div className="flex-1 hidden lg:flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/30">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          <Mail size={28} className="text-zinc-300" />
        </div>
        <p className="text-sm font-medium text-zinc-400">Selecione uma mensagem</p>
        <p className="text-xs text-zinc-300 mt-1">ou escreva uma nova</p>
      </div>
    );
  };

  // =====================================================================
  // MAIN RENDER
  // =====================================================================
  return (
    <div className="h-[calc(100vh-110px)] min-h-[550px] flex bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm relative">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {renderSidebar()}

      {/* Email list */}
      {renderEmailList()}

      {/* Reading / Compose pane */}
      {composeMode !== 'none' ? renderCompose() : renderReadingPane()}
    </div>
  );
}
