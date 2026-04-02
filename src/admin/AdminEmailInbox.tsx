import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MEDUSA_URL } from './adminApi';
import {
  Mail, Inbox, Send, RefreshCw, ArrowLeft, Reply, Loader2,
  Paperclip, ChevronLeft, ChevronRight, AlertCircle, X,
  CheckCircle2, Edit3, Trash2, File, Clock,
  MailOpen, Search, Activity, XCircle, Zap, User,
  ShoppingBag, Bot, MousePointer, ChevronDown,
  Info, BarChart3, AlertTriangle, Hash, Globe,
  ArrowUpRight, Eye, EyeOff, RotateCcw, Copy
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

type EmailLogEntry = {
  id: number;
  timestamp: string;
  email_type: string;
  template: string | null;
  trigger_source: string | null;
  trigger_action: string | null;
  is_automatic: boolean;
  recipient: string;
  sender: string | null;
  subject: string | null;
  order_id: string | null;
  order_display_id: number | null;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  message_id: string | null;
  in_reply_to: string | null;
  thread_references: string | null;
  provider_response: string | null;
  error_message: string | null;
  error_code: string | null;
  sent_to_folder: boolean;
  sent_to_folder_error: string | null;
  actor_type: string | null;
  actor_label: string | null;
  session_id: string | null;
  ip_address: string | null;
  html_length: number;
  text_length: number;
  has_attachments: boolean;
  retry_count: number;
  duration_ms: number | null;
  payload_summary: any;
};

type EmailStats = {
  total: number;
  sent: number;
  failed: number;
  today_sent: number;
  today_failed: number;
  by_type: Record<string, number>;
};

type FolderInfo = {
  name: string;
  path: string;
  specialUse: string | null;
};

type ComposeMode = 'none' | 'new' | 'reply';
type ActiveView = 'inbox' | 'sent' | 'spam' | 'trash' | 'debug';

// =====================================================================
// PERSISTENT CACHE
// =====================================================================
const CACHE_TTL = 5 * 60 * 1000;
const emailListCache = new Map<string, { emails: EmailSummary[]; total: number; pages: number; ts: number }>();
const emailBodyCache = new Map<string, { email: EmailFull; ts: number }>();
let folderCacheData: { folders: FolderInfo[]; ts: number } = { folders: [], ts: 0 };

// =====================================================================
// HELPERS
// =====================================================================
function formatEmailDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
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
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
}

function formatLogDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function senderDisplay(people: { name: string; address: string }[]): string {
  if (!people?.length) return 'Desconhecido';
  const p = people[0];
  return p.name || p.address?.split('@')[0] || 'Desconhecido';
}

function senderInitial(people: { name: string; address: string }[]): string {
  if (!people?.length) return '?';
  const p = people[0];
  const name = p.name || p.address || '?';
  return name.charAt(0).toUpperCase();
}

/**
 * Sanitize HTML for safe iframe rendering.
 * Strips scripts, event handlers, and dangerous content.
 * Handles quoted-printable artifacts and MIME encoding issues.
 */
function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  
  let cleaned = html
    // Remove script tags and their content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove event handlers
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: URLs
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    // Fix common quoted-printable artifacts that slip through
    .replace(/=\r?\n/g, '') // QP soft line breaks
    .replace(/=3D/gi, '=') // QP encoded equals
    .replace(/=20/g, ' ') // QP encoded space
    .replace(/=E2=80=99/g, '\u2019') // Right single quote
    .replace(/=E2=80=9C/g, '\u201C') // Left double quote
    .replace(/=E2=80=9D/g, '\u201D') // Right double quote
    .replace(/=C3=A7/gi, '\u00E7') // c cedilla
    .replace(/=C3=A3/gi, '\u00E3') // a tilde
    .replace(/=C3=B5/gi, '\u00F5') // o tilde
    .replace(/=C3=A9/gi, '\u00E9') // e acute
    .replace(/=C3=A1/gi, '\u00E1') // a acute
    .replace(/=C3=AD/gi, '\u00ED') // i acute
    .replace(/=C3=BA/gi, '\u00FA') // u acute
    .replace(/=C3=B3/gi, '\u00F3'); // o acute

  return cleaned;
}

/**
 * Decode quoted-printable text content to clean text.
 */
function decodeQuotedPrintableText(text: string): string {
  if (!text) return '';
  return text
    .replace(/=\r?\n/g, '') // Soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Build clean HTML-quoted reply with proper formatting.
 * Uses the original email's HTML if available, falling back to text.
 */
function buildReplyQuotedHtml(email: EmailFull): string {
  const quoteDate = formatFullDate(email.date);
  const quoteSender = senderDisplay(email.from);
  const senderEmail = email.from[0]?.address || '';

  // Use text version for quoted content, cleaned up
  let quotedBody = '';
  if (email.text) {
    const cleanText = decodeQuotedPrintableText(email.text);
    // Convert text to HTML preserving line breaks
    quotedBody = cleanText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  } else if (email.html) {
    quotedBody = email.html;
  }

  // Limit quoted content
  if (quotedBody.length > 5000) {
    quotedBody = quotedBody.substring(0, 5000) + '<br>...';
  }

  return `<br><br><div style="border-left:2px solid #d1d5db;padding-left:12px;margin-top:16px;color:#6b7280;">
<p style="font-size:12px;color:#9ca3af;margin:0 0 8px;">Em ${quoteDate}, ${quoteSender} &lt;${senderEmail}&gt; escreveu:</p>
${quotedBody}
</div>`;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  order_received: 'Pedido Recebido',
  order_paid: 'Pagamento Confirmado',
  order_shipped: 'Pedido Enviado',
  order_delivered: 'Pedido Entregue',
  manual: 'Manual',
};

const EMAIL_TYPE_COLORS: Record<string, string> = {
  order_received: 'text-amber-600 bg-amber-50',
  order_paid: 'text-emerald-600 bg-emerald-50',
  order_shipped: 'text-blue-600 bg-blue-50',
  order_delivered: 'text-purple-600 bg-purple-50',
  manual: 'text-zinc-600 bg-zinc-100',
};

const EMAIL_STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; icon: any }> = {
  queued: { label: 'Na Fila', color: 'text-amber-600', bgClass: 'bg-amber-50 border-amber-200', icon: Clock },
  sending: { label: 'Enviando', color: 'text-blue-600', bgClass: 'bg-blue-50 border-blue-200', icon: Loader2 },
  sent: { label: 'Enviado', color: 'text-emerald-600', bgClass: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  failed: { label: 'Falhou', color: 'text-red-600', bgClass: 'bg-red-50 border-red-200', icon: XCircle },
};

const TRIGGER_LABELS: Record<string, string> = {
  pedidos_route: 'Admin (Pedidos)',
  admin_email: 'Admin (Email)',
  webhook: 'Webhook',
  system: 'Sistema',
};

// =====================================================================
// API LAYER
// =====================================================================
// Build consistent audit headers (matches adminApi.ts getAuditHeaders)
function getEmailAuditHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  let sid = sessionStorage.getItem('admin_session_id');
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    sessionStorage.setItem('admin_session_id', sid);
  }
  headers['X-Audit-Session-Id'] = sid;
  headers['X-Audit-Origin'] = 'admin_panel';
  headers['X-Audit-Actor-Type'] = 'admin';
  const label = localStorage.getItem('admin_actor_label');
  if (label) headers['X-Audit-Actor-Label'] = label;
  return headers;
}

async function emailFetch(path: string) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');
  const res = await fetch(`${MEDUSA_URL}/admin/email${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...getEmailAuditHeaders(),
    },
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...getEmailAuditHeaders(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// =====================================================================
// STATUS BADGE COMPONENT
// =====================================================================
function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'xs' }) {
  const cfg = EMAIL_STATUS_CONFIG[status] || EMAIL_STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  const sizeClass = size === 'xs' ? 'text-[9px] px-1.5 py-0.5 gap-0.5' : 'text-[10px] px-2 py-0.5 gap-1';
  const iconSize = size === 'xs' ? 8 : 10;
  return (
    <span className={`inline-flex items-center ${sizeClass} rounded-full font-bold border ${cfg.bgClass} ${cfg.color}`}>
      <Icon size={iconSize} className={status === 'sending' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = EMAIL_TYPE_LABELS[type] || type;
  const colorClass = EMAIL_TYPE_COLORS[type] || 'text-zinc-600 bg-zinc-100';
  return (
    <span className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function AdminEmailInbox() {
  // --- View state ---
  const [activeView, setActiveView] = useState<ActiveView>('inbox');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- IMAP folders ---
  const [folders, setFolders] = useState<FolderInfo[]>(folderCacheData.folders);
  const [imapFolder, setImapFolder] = useState('INBOX');

  // --- Email list state (IMAP) ---
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // --- Sent logs (DB) ---
  const [sentLogs, setSentLogs] = useState<EmailLogEntry[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [sentPage, setSentPage] = useState(1);
  const [sentPages, setSentPages] = useState(0);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sentFilter, setSentFilter] = useState<{ status?: string; email_type?: string; recipient?: string }>({});
  const [sentSearchInput, setSentSearchInput] = useState('');

  // --- Debug logs (DB) ---
  const [debugLogs, setDebugLogs] = useState<EmailLogEntry[]>([]);
  const [debugTotal, setDebugTotal] = useState(0);
  const [debugPage, setDebugPage] = useState(1);
  const [debugPages, setDebugPages] = useState(0);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [debugFilter, setDebugFilter] = useState<{ status?: string; email_type?: string; order_display_id?: string }>({});

  // --- Stats ---
  const [stats, setStats] = useState<EmailStats | null>(null);

  // --- Email read state ---
  const [currentEmail, setCurrentEmail] = useState<EmailFull | null>(null);
  const [currentUid, setCurrentUid] = useState<number | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);

  // --- Log detail state ---
  const [selectedLog, setSelectedLog] = useState<EmailLogEntry | null>(null);

  // --- Compose state ---
  const [composeMode, setComposeMode] = useState<ComposeMode>('none');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeHtml, setComposeHtml] = useState('');
  const [composeReplyTo, setComposeReplyTo] = useState<string | null>(null);
  const [composeReferences, setComposeReferences] = useState<string | null>(null);
  const [composeQuotedHtml, setComposeQuotedHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // --- Refs ---
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const composeEditorRef = useRef<HTMLDivElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // =====================================================================
  // LOAD FOLDERS
  // =====================================================================
  useEffect(() => {
    async function loadFolders() {
      if (folderCacheData.folders.length > 0 && (Date.now() - folderCacheData.ts) < CACHE_TTL) {
        setFolders(folderCacheData.folders);
        return;
      }
      try {
        const res = await emailFetch('?action=folders');
        if (res.success && res.folders) {
          const priority = ['\\Inbox', '\\Sent', '\\Drafts', '\\Trash', '\\Archive', '\\Junk'];
          const sorted = [...res.folders].sort((a: FolderInfo, b: FolderInfo) => {
            const ai = priority.indexOf(a.specialUse || '');
            const bi = priority.indexOf(b.specialUse || '');
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.name.localeCompare(b.name);
          });
          setFolders(sorted);
          folderCacheData = { folders: sorted, ts: Date.now() };
        }
      } catch (e: any) {
        console.error('Failed to load folders:', e.message);
      }
    }
    loadFolders();
  }, []);

  // =====================================================================
  // LOAD STATS
  // =====================================================================
  useEffect(() => {
    async function loadStats() {
      try {
        const res = await emailFetch('?action=email_stats');
        if (res.success) setStats(res.stats);
      } catch {}
    }
    loadStats();
  }, []);

  // =====================================================================
  // LOAD IMAP EMAILS
  // =====================================================================
  const loadImapEmails = useCallback(async (folder: string, pageNum: number, search?: string, forceRefresh = false) => {
    const cacheKey = `${folder}-${pageNum}-${search || ''}`;
    const cached = emailListCache.get(cacheKey);
    if (cached && !forceRefresh && (Date.now() - cached.ts) < CACHE_TTL) {
      setEmails(cached.emails);
      setTotal(cached.total);
      setPages(cached.pages);
      return;
    }
    if (cached) { setEmails(cached.emails); setTotal(cached.total); setPages(cached.pages); }
    setLoadingList(true);
    setListError(null);
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const data = await emailFetch(`?folder=${encodeURIComponent(folder)}&page=${pageNum}&limit=25${searchParam}`);
      if (data.success) {
        setEmails(data.emails || []);
        setTotal(data.total || 0);
        setPages(data.pages || 0);
        emailListCache.set(cacheKey, { emails: data.emails || [], total: data.total || 0, pages: data.pages || 0, ts: Date.now() });
      }
    } catch (err: any) {
      if (!cached) setListError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // =====================================================================
  // LOAD SENT LOGS (from DB -- source of truth)
  // =====================================================================
  const loadSentLogs = useCallback(async (pageNum: number, filters?: typeof sentFilter) => {
    setLoadingSent(true);
    try {
      const params = new URLSearchParams();
      params.set('action', 'sent_logs');
      params.set('page', String(pageNum));
      params.set('limit', '25');
      if (filters?.status) params.set('status', filters.status);
      if (filters?.email_type) params.set('email_type', filters.email_type);
      if (filters?.recipient) params.set('recipient', filters.recipient);
      const data = await emailFetch(`?${params.toString()}`);
      if (data.success) {
        setSentLogs(data.emails || []);
        setSentTotal(data.total || 0);
        setSentPages(data.pages || 0);
      }
    } catch (err: any) {
      console.error('[SENT LOGS]', err.message);
    } finally {
      setLoadingSent(false);
    }
  }, []);

  // =====================================================================
  // LOAD DEBUG LOGS (from DB -- full tracking)
  // =====================================================================
  const loadDebugLogs = useCallback(async (pageNum: number, filters?: typeof debugFilter) => {
    setLoadingDebug(true);
    try {
      const params = new URLSearchParams();
      params.set('action', 'email_logs');
      params.set('page', String(pageNum));
      params.set('limit', '30');
      if (filters?.status) params.set('status', filters.status);
      if (filters?.email_type) params.set('email_type', filters.email_type);
      if (filters?.order_display_id) params.set('order_display_id', filters.order_display_id);
      const data = await emailFetch(`?${params.toString()}`);
      if (data.success) {
        setDebugLogs(data.logs || []);
        setDebugTotal(data.total || 0);
        setDebugPages(data.pages || 0);
      }
    } catch (err: any) {
      console.error('[DEBUG LOGS]', err.message);
    } finally {
      setLoadingDebug(false);
    }
  }, []);

  // =====================================================================
  // EFFECTS: Load data based on active view
  // =====================================================================
  useEffect(() => {
    if (activeView === 'inbox' || activeView === 'spam' || activeView === 'trash') {
      const folderMap: Record<string, string> = {
        inbox: 'INBOX',
        spam: folders.find(f => f.specialUse === '\\Junk')?.path || 'Junk',
        trash: folders.find(f => f.specialUse === '\\Trash')?.path || 'Trash',
      };
      const folder = folderMap[activeView] || 'INBOX';
      setImapFolder(folder);
      loadImapEmails(folder, page, searchQuery || undefined);
    } else if (activeView === 'sent') {
      loadSentLogs(sentPage, sentFilter);
    } else if (activeView === 'debug') {
      loadDebugLogs(debugPage, debugFilter);
    }
  }, [activeView, page, sentPage, debugPage, searchQuery, sentFilter, debugFilter, folders, loadImapEmails, loadSentLogs, loadDebugLogs]);

  // =====================================================================
  // OPEN EMAIL (IMAP)
  // =====================================================================
  const handleOpenEmail = useCallback(async (uid: number) => {
    if (currentEmail?.uid === uid && composeMode === 'none') return;
    setComposeMode('none');
    setCurrentUid(uid);
    setSelectedLog(null);
    const bodyKey = `${imapFolder}-${uid}`;
    const cached = emailBodyCache.get(bodyKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      setCurrentEmail(cached.email);
      setEmails(prev => prev.map(e => e.uid === uid ? { ...e, seen: true } : e));
      return;
    }
    setLoadingEmail(true);
    setCurrentEmail(null);
    try {
      const data = await emailFetch(`?action=read&uid=${uid}&folder=${encodeURIComponent(imapFolder)}`);
      if (data.success && data.email) {
        setCurrentEmail(data.email);
        emailBodyCache.set(bodyKey, { email: data.email, ts: Date.now() });
        setEmails(prev => prev.map(e => e.uid === uid ? { ...e, seen: true } : e));
      }
    } catch (err: any) {
      console.error('[EMAIL READ]', err.message);
    }
    setLoadingEmail(false);
  }, [imapFolder, currentEmail, composeMode]);

  // =====================================================================
  // COMPOSE / REPLY
  // =====================================================================
  const startCompose = useCallback(() => {
    setCurrentEmail(null);
    setCurrentUid(null);
    setSelectedLog(null);
    setComposeTo('');
    setComposeSubject('');
    setComposeHtml('');
    setComposeQuotedHtml('');
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
      currentEmail.subject?.startsWith('Re:') ? currentEmail.subject : `Re: ${currentEmail.subject || ''}`
    );
    setComposeReplyTo(currentEmail.messageId);
    setComposeReferences(
      currentEmail.references
        ? `${currentEmail.references} ${currentEmail.messageId}`
        : currentEmail.messageId
    );
    // Set quoted HTML content separately
    setComposeQuotedHtml(buildReplyQuotedHtml(currentEmail));
    setComposeHtml('');
    setSendResult(null);
    setComposeMode('reply');
  }, [currentEmail]);

  // Focus management for compose
  useEffect(() => {
    if (composeMode === 'none') return;
    const timer = setTimeout(() => {
      if (composeMode === 'reply') {
        composeEditorRef.current?.focus();
      } else if (composeMode === 'new') {
        toInputRef.current?.focus();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [composeMode]);

  const handleSend = useCallback(async () => {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      // Get content from contentEditable div
      const editorContent = composeEditorRef.current?.innerHTML || '';
      const fullHtml = composeMode === 'reply'
        ? `${editorContent}${composeQuotedHtml}`
        : editorContent;

      // Also generate plain text version
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = fullHtml;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';

      const data = await emailPost({
        to: composeTo.trim(),
        subject: composeSubject.trim(),
        html: fullHtml || undefined,
        text: plainText || undefined,
        inReplyTo: composeReplyTo,
        references: composeReferences,
      });
      if (data.success) {
        const folderMsg = data.sentToFolder ? ' (copia salva em Enviados)' : '';
        setSendResult({ success: true, message: `Email enviado com sucesso!${folderMsg} Log: #${data.logId || '-'}` });
        // Refresh stats
        try {
          const statsRes = await emailFetch('?action=email_stats');
          if (statsRes.success) setStats(statsRes.stats);
        } catch {}
        setTimeout(() => {
          setComposeMode('none');
          setSendResult(null);
          if (activeView === 'sent') loadSentLogs(sentPage, sentFilter);
        }, 2000);
      } else {
        setSendResult({ success: false, message: data.error || 'Erro ao enviar' });
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err.message });
    }
    setSending(false);
  }, [composeTo, composeSubject, composeHtml, composeQuotedHtml, composeReplyTo, composeReferences, composeMode, activeView, sentPage, sentFilter, loadSentLogs]);

  const cancelCompose = useCallback(() => {
    setComposeMode('none');
    setSendResult(null);
  }, []);

  // =====================================================================
  // IFRAME RENDERING for email body (IMAP reading)
  // =====================================================================
  useEffect(() => {
    if (!currentEmail || composeMode !== 'none' || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    let content: string;
    if (currentEmail.html) {
      content = sanitizeEmailHtml(currentEmail.html);
    } else if (currentEmail.text) {
      // Decode any quoted-printable artifacts in text
      const cleanedText = decodeQuotedPrintableText(currentEmail.text);
      const escaped = cleanedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      content = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.7;color:#374151;margin:0;">${escaped}</div>`;
    } else {
      content = '<p style="color:#9ca3af;font-style:italic;">Sem conteudo</p>';
    }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      font-size: 14px; color: #1f2937; margin: 0; padding: 16px;
      line-height: 1.6; word-break: break-word; background: #fff;
    }
    img { max-width: 100%; height: auto; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    pre { white-space: pre-wrap; word-break: break-word; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; background: #f9fafb; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb; }
    code { font-family: 'SF Mono', Monaco, monospace; font-size: 13px; background: #f3f4f6; padding: 2px 5px; border-radius: 4px; }
    blockquote { border-left: 3px solid #d1d5db; margin: 8px 0; padding-left: 12px; color: #6b7280; }
    table { max-width: 100% !important; border-collapse: collapse; }
    td, th { word-break: break-word; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
    /* Gmail-style quoted content */
    .gmail_quote, .yahoo_quoted, [class*="gmail_quote"] {
      border-left: 2px solid #d1d5db; padding-left: 12px; margin-top: 16px; color: #6b7280;
    }
    /* Clean up common email artifacts */
    .gmail_attr { color: #9ca3af; font-size: 12px; margin-bottom: 4px; }
  </style>
</head><body>${content}</body></html>`);
    doc.close();

    // Auto-resize iframe to fit content
    const resize = () => {
      if (iframeRef.current?.contentDocument?.body) {
        const h = iframeRef.current.contentDocument.body.scrollHeight;
        iframeRef.current.style.height = Math.max(200, Math.min(h + 40, 3000)) + 'px';
      }
    };
    setTimeout(resize, 200);
    setTimeout(resize, 600);
    setTimeout(resize, 1500);
  }, [currentEmail, composeMode]);

  // =====================================================================
  // SIDEBAR CLOSE on outside click
  // =====================================================================
  useEffect(() => {
    if (!sidebarOpen) return;
    const h = (e: MouseEvent) => { if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) setSidebarOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [sidebarOpen]);

  // =====================================================================
  // VIEW CHANGE
  // =====================================================================
  const handleViewChange = useCallback((view: ActiveView) => {
    setActiveView(view);
    setPage(1);
    setSentPage(1);
    setDebugPage(1);
    setCurrentEmail(null);
    setCurrentUid(null);
    setSelectedLog(null);
    setComposeMode('none');
    setSearchQuery('');
    setSearchInput('');
    setSentSearchInput('');
    setSidebarOpen(false);
  }, []);

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const handleSentSearch = useCallback(() => {
    setSentFilter(f => ({ ...f, recipient: sentSearchInput.trim() || undefined }));
    setSentPage(1);
  }, [sentSearchInput]);

  const handleBackToList = useCallback(() => {
    setCurrentEmail(null);
    setCurrentUid(null);
    setSelectedLog(null);
    setComposeMode('none');
  }, []);

  // Copy to clipboard helper
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // =====================================================================
  // RENDER: SIDEBAR
  // =====================================================================
  const isImapView = ['inbox', 'spam', 'trash'].includes(activeView);

  const sidebarItems: { view: ActiveView; label: string; icon: any; badge?: number; badgeColor?: string }[] = [
    { view: 'inbox', label: 'Recebidos', icon: Inbox },
    { view: 'sent', label: 'Enviados', icon: Send, badge: stats?.today_sent, badgeColor: 'bg-emerald-100 text-emerald-600' },
    { view: 'spam', label: 'Spam', icon: AlertCircle },
    { view: 'trash', label: 'Lixeira', icon: Trash2 },
    { view: 'debug', label: 'Logs / Debug', icon: Activity, badge: stats?.today_failed, badgeColor: 'bg-red-100 text-red-600' },
  ];

  const renderSidebar = () => (
    <div
      ref={sidebarRef}
      className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 absolute lg:relative z-30 w-60 h-full bg-zinc-50 border-r border-zinc-200 flex flex-col transition-transform duration-200 ease-in-out`}
    >
      <div className="flex items-center justify-between p-3 lg:hidden border-b border-zinc-100">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Email</span>
        <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg"><X size={18} /></button>
      </div>

      <div className="p-3">
        <button onClick={startCompose} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm">
          <Edit3 size={15} />Escrever
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        <div className="space-y-0.5 px-2">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.view;
            return (
              <button key={item.view} onClick={() => handleViewChange(item.view)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800'}`}>
                <Icon size={16} className={isActive ? 'text-blue-500' : 'text-zinc-400'} />
                <span className="truncate flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${item.badgeColor || 'bg-blue-100 text-blue-600'}`}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Stats summary */}
        {stats && (
          <div className="mx-3 mt-4 p-3 bg-white border border-zinc-200 rounded-xl">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><BarChart3 size={10} /> Resumo Geral</p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-1.5 rounded-lg bg-emerald-50">
                <p className="text-lg font-bold text-emerald-600">{stats.sent}</p>
                <p className="text-[9px] text-emerald-500">Enviados</p>
              </div>
              <div className="p-1.5 rounded-lg bg-red-50">
                <p className="text-lg font-bold text-red-500">{stats.failed}</p>
                <p className="text-[9px] text-red-400">Falhas</p>
              </div>
              <div className="p-1.5 rounded-lg bg-blue-50">
                <p className="text-sm font-bold text-blue-600">{stats.today_sent}</p>
                <p className="text-[9px] text-blue-400">Hoje OK</p>
              </div>
              <div className="p-1.5 rounded-lg bg-amber-50">
                <p className="text-sm font-bold text-amber-600">{stats.today_failed}</p>
                <p className="text-[9px] text-amber-400">Hoje Falha</p>
              </div>
            </div>
            {/* Type breakdown */}
            {Object.keys(stats.by_type).length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-100">
                <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Por Tipo</p>
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-[10px] py-0.5">
                    <span className="text-zinc-500">{EMAIL_TYPE_LABELS[type] || type}</span>
                    <span className="font-bold text-zinc-700">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // =====================================================================
  // RENDER: IMAP EMAIL LIST (Inbox, Spam, Trash)
  // =====================================================================
  const renderImapList = () => {
    const isNarrow = !!(currentEmail || composeMode !== 'none');
    const viewLabel = { inbox: 'Recebidos', spam: 'Spam', trash: 'Lixeira' }[activeView] || 'Email';

    return (
      <div className={`flex flex-col border-r border-zinc-200 bg-white transition-all duration-200 ${isNarrow ? 'hidden lg:flex lg:w-[320px] xl:w-[380px]' : 'w-full lg:w-[320px] xl:w-[380px]'}`}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-100 bg-white/90 backdrop-blur-sm gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 -ml-1 text-zinc-500 hover:bg-zinc-100 rounded-lg"><ChevronLeft size={18} /></button>
            <h2 className="font-bold text-zinc-900 truncate text-sm">{viewLabel}</h2>
            {total > 0 && <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 px-1.5 py-0.5 rounded-full">{total}</span>}
          </div>
          <button onClick={() => loadImapEmails(imapFolder, page, searchQuery || undefined, true)} disabled={loadingList} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-lg disabled:opacity-50" title="Atualizar">
            <RefreshCw size={15} className={loadingList ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-zinc-50">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Buscar por assunto, remetente..." className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 placeholder:text-zinc-300" />
            {searchQuery && (
              <button onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"><X size={12} /></button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listError && emails.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle size={24} className="mx-auto mb-3 text-red-300" />
              <p className="text-sm text-red-600 font-medium mb-1">Erro ao carregar</p>
              <p className="text-xs text-zinc-400 mb-3">{listError}</p>
              <button onClick={() => loadImapEmails(imapFolder, page, searchQuery || undefined, true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Tentar novamente</button>
            </div>
          ) : emails.length === 0 && !loadingList ? (
            <div className="p-12 text-center">
              <MailOpen size={32} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-medium text-zinc-400">{searchQuery ? 'Nenhum resultado' : 'Nenhuma mensagem'}</p>
            </div>
          ) : emails.length === 0 && loadingList ? (
            <div className="p-8 text-center"><Loader2 size={22} className="animate-spin text-blue-400 mx-auto mb-3" /><p className="text-xs text-zinc-400">Carregando...</p></div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {emails.map(email => {
                const isActive = currentUid === email.uid;
                const isUnread = !email.seen;
                return (
                  <button key={email.uid} onClick={() => handleOpenEmail(email.uid)}
                    className={`w-full text-left px-4 py-3 transition-all relative ${isActive ? 'bg-blue-50/80' : isUnread ? 'bg-white hover:bg-zinc-50' : 'bg-white hover:bg-zinc-50/80'}`}>
                    {isUnread && !isActive && <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500" />}
                    <div className="pl-2">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-sm truncate ${isUnread ? 'font-bold text-zinc-900' : 'font-medium text-zinc-600'}`}>
                          {senderDisplay(email.from)}
                        </span>
                        <span className={`text-[10px] whitespace-nowrap flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-zinc-400'}`}>{formatEmailDate(email.date)}</span>
                      </div>
                      <p className={`text-xs truncate ${isUnread ? 'font-semibold text-zinc-800' : 'text-zinc-500'}`}>{email.subject || '(sem assunto)'}</p>
                      {email.hasAttachments && <div className="flex items-center gap-1 mt-1"><Paperclip size={10} className="text-zinc-400" /><span className="text-[10px] text-zinc-400">Anexo</span></div>}
                    </div>
                  </button>
                );
              })}
              {loadingList && emails.length > 0 && <div className="py-2 text-center"><Loader2 size={14} className="animate-spin text-blue-400 mx-auto" /></div>}
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100 bg-white">
            <span className="text-[10px] text-zinc-400">{page}/{pages} ({total})</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20"><ChevronLeft size={15} /></button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // =====================================================================
  // RENDER: SENT LOGS LIST (from DB -- real source of truth for sent emails)
  // =====================================================================
  const renderSentList = () => {
    const isNarrow = !!selectedLog || composeMode !== 'none';
    return (
      <div className={`flex flex-col border-r border-zinc-200 bg-white transition-all duration-200 ${isNarrow ? 'hidden lg:flex lg:w-[380px] xl:w-[420px]' : 'w-full'}`}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-100 bg-white/90 backdrop-blur-sm gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 -ml-1 text-zinc-500 hover:bg-zinc-100 rounded-lg"><ChevronLeft size={18} /></button>
            <h2 className="font-bold text-zinc-900 text-sm">Enviados</h2>
            <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 px-1.5 py-0.5 rounded-full">{sentTotal}</span>
          </div>
          <button onClick={() => loadSentLogs(sentPage, sentFilter)} disabled={loadingSent} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-lg disabled:opacity-50">
            <RefreshCw size={14} className={loadingSent ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>

        {/* Search + Filters */}
        <div className="px-3 py-2 border-b border-zinc-50 space-y-1.5">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" value={sentSearchInput} onChange={e => setSentSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSentSearch()}
              placeholder="Buscar por destinatario..." className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 placeholder:text-zinc-300" />
            {sentFilter.recipient && (
              <button onClick={() => { setSentSearchInput(''); setSentFilter(f => ({ ...f, recipient: undefined })); setSentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"><X size={12} /></button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <select value={sentFilter.status || ''} onChange={e => { setSentFilter(f => ({ ...f, status: e.target.value || undefined })); setSentPage(1); }}
              className="text-[10px] bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 outline-none flex-1">
              <option value="">Todos status</option>
              <option value="sent">Enviados</option>
              <option value="failed">Falhas</option>
              <option value="queued">Na Fila</option>
            </select>
            <select value={sentFilter.email_type || ''} onChange={e => { setSentFilter(f => ({ ...f, email_type: e.target.value || undefined })); setSentPage(1); }}
              className="text-[10px] bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 outline-none flex-1">
              <option value="">Todos tipos</option>
              <option value="order_paid">Pago</option>
              <option value="order_received">Recebido</option>
              <option value="order_shipped">Enviado</option>
              <option value="order_delivered">Entregue</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingSent && sentLogs.length === 0 ? (
            <div className="p-8 text-center"><Loader2 size={22} className="animate-spin text-blue-400 mx-auto mb-3" /><p className="text-xs text-zinc-400">Carregando enviados...</p></div>
          ) : sentLogs.length === 0 ? (
            <div className="p-12 text-center">
              <Send size={32} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-medium text-zinc-400">Nenhum email registrado</p>
              <p className="text-xs text-zinc-300 mt-1">Os envios aparecerao aqui automaticamente</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {sentLogs.map(log => {
                const isActive = selectedLog?.id === log.id;
                return (
                  <button key={log.id} onClick={() => { setSelectedLog(log); setCurrentEmail(null); setCurrentUid(null); }}
                    className={`w-full text-left px-4 py-3 transition-all ${isActive ? 'bg-blue-50/80' : 'hover:bg-zinc-50'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <StatusBadge status={log.status} size="xs" />
                        <TypeBadge type={log.email_type} />
                        {log.is_automatic ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-400" title="Automatico"><Bot size={9} /> Auto</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-500" title="Manual"><MousePointer size={9} /> Manual</span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 whitespace-nowrap flex-shrink-0">{formatEmailDate(log.timestamp)}</span>
                    </div>
                    <p className="text-xs font-semibold text-zinc-800 truncate mb-0.5">{log.subject || '(sem assunto)'}</p>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                      <span className="truncate flex-1">Para: {log.recipient}</span>
                      {log.order_display_id && (
                        <span className="flex items-center gap-0.5 flex-shrink-0 text-purple-500 font-semibold">
                          <ShoppingBag size={9} /> #{log.order_display_id}
                        </span>
                      )}
                    </div>
                    {log.status === 'failed' && log.error_message && (
                      <div className="flex items-center gap-1 mt-1 text-[9px] text-red-500">
                        <AlertTriangle size={9} className="flex-shrink-0" />
                        <span className="truncate">{log.error_message}</span>
                      </div>
                    )}
                    {log.duration_ms != null && (
                      <span className="text-[9px] text-zinc-300 mt-0.5 inline-block">{log.duration_ms}ms</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {sentPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100 bg-white">
            <span className="text-[10px] text-zinc-400">{sentPage}/{sentPages} ({sentTotal})</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setSentPage(p => Math.max(1, p - 1))} disabled={sentPage === 1} className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20"><ChevronLeft size={15} /></button>
              <button onClick={() => setSentPage(p => Math.min(sentPages, p + 1))} disabled={sentPage === sentPages} className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // =====================================================================
  // RENDER: DEBUG LOGS
  // =====================================================================
  const renderDebugList = () => {
    const isNarrow = !!selectedLog || composeMode !== 'none';
    return (
      <div className={`flex flex-col border-r border-zinc-200 bg-white transition-all duration-200 ${isNarrow ? 'hidden lg:flex lg:w-[380px] xl:w-[440px]' : 'w-full'}`}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-100 bg-white/90 backdrop-blur-sm gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 -ml-1 text-zinc-500 hover:bg-zinc-100 rounded-lg"><ChevronLeft size={18} /></button>
            <h2 className="font-bold text-zinc-900 text-sm">Debug / Logs de Email</h2>
            <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 px-1.5 py-0.5 rounded-full">{debugTotal}</span>
          </div>
          <button onClick={() => loadDebugLogs(debugPage, debugFilter)} disabled={loadingDebug} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-lg disabled:opacity-50">
            <RefreshCw size={14} className={loadingDebug ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>

        {/* Debug Filters */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-zinc-50">
          <select value={debugFilter.status || ''} onChange={e => { setDebugFilter(f => ({ ...f, status: e.target.value || undefined })); setDebugPage(1); }}
            className="text-[10px] bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 outline-none">
            <option value="">Todos status</option>
            <option value="sent">Enviados</option>
            <option value="failed">Falhas</option>
            <option value="queued">Na Fila</option>
            <option value="sending">Enviando</option>
          </select>
          <select value={debugFilter.email_type || ''} onChange={e => { setDebugFilter(f => ({ ...f, email_type: e.target.value || undefined })); setDebugPage(1); }}
            className="text-[10px] bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 outline-none">
            <option value="">Todos tipos</option>
            <option value="order_paid">Pagamento</option>
            <option value="order_received">Recebido</option>
            <option value="order_shipped">Enviado</option>
            <option value="order_delivered">Entregue</option>
            <option value="manual">Manual</option>
          </select>
          <div className="relative">
            <Hash size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" placeholder="Pedido" value={debugFilter.order_display_id || ''}
              onChange={e => { setDebugFilter(f => ({ ...f, order_display_id: e.target.value || undefined })); setDebugPage(1); }}
              className="text-[10px] bg-zinc-50 border border-zinc-200 rounded-lg pl-6 pr-2 py-1 w-20 outline-none placeholder:text-zinc-300" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingDebug && debugLogs.length === 0 ? (
            <div className="p-8 text-center"><Loader2 size={22} className="animate-spin text-blue-400 mx-auto mb-3" /><p className="text-xs text-zinc-400">Carregando logs...</p></div>
          ) : debugLogs.length === 0 ? (
            <div className="p-12 text-center">
              <Activity size={32} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-medium text-zinc-400">Nenhum log encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {debugLogs.map(log => {
                const isActive = selectedLog?.id === log.id;
                return (
                  <button key={log.id} onClick={() => { setSelectedLog(log); setCurrentEmail(null); setCurrentUid(null); }}
                    className={`w-full text-left px-3 py-2.5 transition-all text-[11px] ${isActive ? 'bg-blue-50/80' : 'hover:bg-zinc-50'}`}>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={log.status} size="xs" />
                        <TypeBadge type={log.email_type} />
                      </div>
                      <span className="text-[9px] text-zinc-400 whitespace-nowrap">{formatLogDate(log.timestamp)}</span>
                    </div>
                    <p className="text-xs font-medium text-zinc-800 truncate">{log.subject || '(sem assunto)'}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-zinc-400">
                      <span className="truncate">{log.recipient}</span>
                      {log.order_display_id && <span className="text-purple-500 flex-shrink-0 font-semibold">#{log.order_display_id}</span>}
                    </div>
                    {log.status === 'failed' && log.error_message && (
                      <div className="flex items-center gap-1 mt-0.5 text-[9px] text-red-500">
                        <AlertTriangle size={8} className="flex-shrink-0" />
                        <span className="truncate">{log.error_message.substring(0, 60)}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {debugPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100 bg-white">
            <span className="text-[10px] text-zinc-400">{debugPage}/{debugPages} ({debugTotal})</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setDebugPage(p => Math.max(1, p - 1))} disabled={debugPage === 1} className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20"><ChevronLeft size={15} /></button>
              <button onClick={() => setDebugPage(p => Math.min(debugPages, p + 1))} disabled={debugPage === debugPages} className="p-1 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-20"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // =====================================================================
  // RENDER: LOG DETAIL PANEL (for Sent and Debug views)
  // =====================================================================
  const renderLogDetail = () => {
    if (!selectedLog) return null;
    const log = selectedLog;

    const detailSections: { title: string; items: { label: string; value: string | null | undefined; mono?: boolean; copy?: boolean }[] }[] = [
      {
        title: 'Identificacao',
        items: [
          { label: 'ID', value: `#${log.id}` },
          { label: 'Tipo', value: EMAIL_TYPE_LABELS[log.email_type] || log.email_type },
          { label: 'Template', value: log.template },
          { label: 'Pedido', value: log.order_display_id ? `#${log.order_display_id}` : null },
        ],
      },
      {
        title: 'Envio',
        items: [
          { label: 'Destinatario', value: log.recipient, copy: true },
          { label: 'Remetente', value: log.sender },
          { label: 'Assunto', value: log.subject },
          { label: 'Data/Hora', value: formatLogDate(log.timestamp) },
          { label: 'Duracao', value: log.duration_ms ? `${log.duration_ms}ms` : null },
        ],
      },
      {
        title: 'Rastreamento',
        items: [
          { label: 'Message-ID', value: log.message_id, mono: true, copy: true },
          { label: 'In-Reply-To', value: log.in_reply_to, mono: true },
          { label: 'Thread Refs', value: log.thread_references, mono: true },
          { label: 'Salvo IMAP Sent', value: log.sent_to_folder ? 'Sim' : (log.sent_to_folder_error ? `Nao: ${log.sent_to_folder_error}` : 'Nao') },
        ],
      },
      {
        title: 'Contexto',
        items: [
          { label: 'Automatico', value: log.is_automatic ? 'Sim (sistema)' : 'Nao (manual)' },
          { label: 'Origem', value: TRIGGER_LABELS[log.trigger_source || ''] || log.trigger_source },
          { label: 'Acao', value: log.trigger_action },
          { label: 'Operador', value: log.actor_label || (log.actor_type === 'webhook' ? 'SuperFrete' : log.actor_type === 'system' ? 'Sistema' : 'Operador') },
          { label: 'Sessao', value: log.session_id, mono: true },
          { label: 'IP', value: log.ip_address },
        ],
      },
      {
        title: 'Dados Tecnicos',
        items: [
          { label: 'HTML', value: log.html_length ? `${log.html_length} chars` : null },
          { label: 'Texto', value: log.text_length ? `${log.text_length} chars` : null },
          { label: 'Anexos', value: log.has_attachments ? 'Sim' : null },
          { label: 'Retries', value: log.retry_count > 0 ? String(log.retry_count) : null },
        ],
      },
    ];

    return (
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 bg-white flex-shrink-0">
          <button onClick={handleBackToList} className="lg:hidden p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg"><ArrowLeft size={18} /></button>
          <h3 className="font-bold text-zinc-900 text-sm flex-1 truncate">Log #{log.id}</h3>
          <StatusBadge status={log.status} />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 space-y-4">
            {/* Status banners */}
            {log.status === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-red-700">Email FALHOU</p>
                    {log.error_message && <p className="text-xs text-red-600 mt-1 break-all">{log.error_message}</p>}
                    {log.error_code && <p className="text-[10px] text-red-500 mt-0.5 font-mono">Codigo: {log.error_code}</p>}
                  </div>
                </div>
              </div>
            )}

            {log.status === 'sent' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-emerald-700">Email ENVIADO com sucesso</p>
                    {log.provider_response && (
                      <p className="text-[10px] text-emerald-600 mt-0.5 break-all font-mono">Provider: {log.provider_response}</p>
                    )}
                    {!log.sent_to_folder && (
                      <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                        <AlertTriangle size={10} /> Nao salvo na pasta Sent do IMAP
                        {log.sent_to_folder_error && <span> ({log.sent_to_folder_error})</span>}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {log.status === 'queued' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  <p className="text-sm font-bold text-amber-700">Email na fila - ainda nao foi processado</p>
                </div>
              </div>
            )}

            {/* Detail sections */}
            {detailSections.map(section => {
              const filteredItems = section.items.filter(f => f.value != null && f.value !== '');
              if (filteredItems.length === 0) return null;
              return (
                <div key={section.title}>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">{section.title}</p>
                  <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden divide-y divide-zinc-200">
                    {filteredItems.map((f, i) => (
                      <div key={i} className="flex items-start px-4 py-2.5 gap-3">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-24 flex-shrink-0 pt-0.5">{f.label}</span>
                        <span className={`text-xs text-zinc-700 break-all flex-1 ${f.mono ? 'font-mono text-[10px]' : ''}`}>{f.value}</span>
                        {f.copy && f.value && (
                          <button onClick={() => copyToClipboard(f.value!)} className="p-1 text-zinc-300 hover:text-zinc-500 flex-shrink-0" title="Copiar">
                            <Copy size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Provider Response */}
            {log.provider_response && (
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Resposta do Provider</p>
                <pre className="text-[10px] text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg p-3 whitespace-pre-wrap break-all font-mono">{log.provider_response}</pre>
              </div>
            )}

            {/* Payload Summary */}
            {log.payload_summary && (
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Payload Resumo</p>
                <pre className="text-[10px] text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg p-3 whitespace-pre-wrap break-all font-mono">
                  {typeof log.payload_summary === 'string' ? log.payload_summary : JSON.stringify(log.payload_summary, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
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
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 bg-white">
          <button onClick={cancelCompose} className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg"><ArrowLeft size={18} /></button>
          <h3 className="font-bold text-zinc-900 text-sm">{isReply ? 'Responder' : 'Nova Mensagem'}</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-5 space-y-4">
            {/* To field */}
            <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide w-14 flex-shrink-0">Para</label>
              {isReply ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                    <User size={12} />{composeTo}
                  </span>
                </div>
              ) : (
                <input ref={toInputRef} type="email" value={composeTo} onChange={e => setComposeTo(e.target.value)}
                  placeholder="destinatario@email.com" className="flex-1 text-sm text-zinc-800 bg-transparent border-none outline-none placeholder:text-zinc-300" />
              )}
            </div>

            {/* Subject field */}
            <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide w-14 flex-shrink-0">Assunto</label>
              {isReply ? (
                <span className="text-sm text-zinc-500 truncate">{composeSubject}</span>
              ) : (
                <input type="text" value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Assunto da mensagem" className="flex-1 text-sm text-zinc-800 bg-transparent border-none outline-none placeholder:text-zinc-300" />
              )}
            </div>

            {/* Rich text editor area (contentEditable) */}
            <div className="border border-zinc-200 rounded-xl overflow-hidden focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
              <div
                ref={composeEditorRef}
                contentEditable
                data-placeholder="Escreva sua mensagem..."
                className="min-h-[200px] max-h-[400px] overflow-y-auto p-4 text-sm text-zinc-800 leading-relaxed outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-zinc-300 [&:empty]:before:pointer-events-none"
                onInput={() => {
                  // Track changes for send validation
                  setComposeHtml(composeEditorRef.current?.innerHTML || '');
                }}
              />
            </div>

            {/* Quoted content for replies (read-only, styled) */}
            {isReply && composeQuotedHtml && (
              <div className="border-l-2 border-zinc-300 pl-4 py-2">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1">Mensagem original</div>
                <div
                  className="text-xs text-zinc-400 leading-relaxed prose prose-xs max-w-none"
                  dangerouslySetInnerHTML={{ __html: composeQuotedHtml }}
                />
              </div>
            )}

            {/* Thread info for replies */}
            {isReply && composeReplyTo && (
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 bg-zinc-50 px-3 py-2 rounded-lg">
                <Info size={10} className="flex-shrink-0" />
                <span>Resposta a thread: {composeReplyTo}</span>
              </div>
            )}

            {/* Send result */}
            {sendResult && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${sendResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {sendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {sendResult.message}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-100 bg-white px-5 py-3 flex items-center gap-3">
          <button onClick={handleSend} disabled={sending || !composeTo.trim() || !composeSubject.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Enviar
          </button>
          <button onClick={cancelCompose} className="px-4 py-2 text-zinc-500 font-medium hover:bg-zinc-100 rounded-xl text-sm transition-colors">Descartar</button>
        </div>
      </div>
    );
  };

  // =====================================================================
  // RENDER: EMAIL READING PANE (IMAP emails)
  // =====================================================================
  const renderReadingPane = () => {
    if (composeMode !== 'none') return null;

    if (loadingEmail && !currentEmail) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/30">
          <Loader2 size={28} className="animate-spin mb-3 text-blue-400" />
          <p className="text-sm font-medium text-zinc-500">Abrindo mensagem...</p>
        </div>
      );
    }

    if (currentEmail) {
      return (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-white/90 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-1">
              <button onClick={handleBackToList} className="lg:hidden p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg"><ArrowLeft size={18} /></button>
              <button onClick={startReply} className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800 rounded-lg text-sm font-medium transition-colors">
                <Reply size={15} /><span>Responder</span>
              </button>
            </div>
            {currentEmail.messageId && (
              <button onClick={() => copyToClipboard(currentEmail.messageId || '')} className="text-[10px] text-zinc-400 hover:text-zinc-600 flex items-center gap-1" title="Copiar Message-ID">
                <Copy size={10} /><span className="hidden xl:inline">ID</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Subject */}
            <div className="px-6 pt-5 pb-3">
              <h1 className="text-lg font-bold text-zinc-900 leading-snug">{currentEmail.subject || '(sem assunto)'}</h1>
            </div>

            {/* Sender info */}
            <div className="px-6 pb-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5">
                {senderInitial(currentEmail.from)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-zinc-900 text-sm">{senderDisplay(currentEmail.from)}</span>
                  <span className="text-xs text-zinc-400">&lt;{currentEmail.from[0]?.address}&gt;</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                  <span>Para: {currentEmail.to.map(t => t.name || t.address).join(', ')}</span>
                </div>
                {currentEmail.cc.length > 0 && (
                  <div className="text-[10px] text-zinc-400 mt-0.5">CC: {currentEmail.cc.map(c => c.name || c.address).join(', ')}</div>
                )}
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1">
                  <Clock size={10} /><span>{formatFullDate(currentEmail.date)}</span>
                </div>
              </div>
            </div>

            {/* Attachments */}
            {currentEmail.attachments.length > 0 && (
              <div className="px-6 py-3 mx-6 mb-3 bg-zinc-50 rounded-xl">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Paperclip size={10} />{currentEmail.attachments.length} anexo{currentEmail.attachments.length > 1 ? 's' : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {currentEmail.attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-600">
                      <File size={12} className="text-blue-500 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">{att.filename}</span>
                      <span className="text-zinc-400 flex-shrink-0">({Math.round(att.size / 1024)}KB)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email body rendered in iframe */}
            <div className="px-6 pb-6">
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin allow-popups"
                className="w-full border-0 rounded-lg"
                style={{ minHeight: '200px' }}
                title="Conteudo do email"
              />
            </div>

            {/* Reply button at bottom */}
            <div className="px-6 pb-6">
              <button onClick={startReply} className="w-full flex items-center justify-center gap-2 py-3 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 transition-all">
                <Reply size={15} />Responder a esta mensagem
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Empty state
    return (
      <div className="flex-1 hidden lg:flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/30">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4"><Mail size={28} className="text-zinc-300" /></div>
        <p className="text-sm font-medium text-zinc-400">Selecione uma mensagem</p>
        <p className="text-xs text-zinc-300 mt-1">ou escreva uma nova</p>
      </div>
    );
  };

  // =====================================================================
  // RENDER: RIGHT PANEL (context-dependent)
  // =====================================================================
  const renderRightPanel = () => {
    if (composeMode !== 'none') return renderCompose();

    // In sent/debug views, show log detail
    if ((activeView === 'sent' || activeView === 'debug') && selectedLog) {
      return renderLogDetail();
    }

    // In IMAP views, show reading pane
    if (isImapView) return renderReadingPane();

    // Sent/Debug without selection: show empty state
    return (
      <div className="flex-1 hidden lg:flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/30">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          {activeView === 'debug' ? <Activity size={28} className="text-zinc-300" /> : <Send size={28} className="text-zinc-300" />}
        </div>
        <p className="text-sm font-medium text-zinc-400">
          {activeView === 'debug' ? 'Selecione um log para ver detalhes' : 'Selecione um email enviado'}
        </p>
        <p className="text-xs text-zinc-300 mt-1">
          {activeView === 'sent' ? 'Todos os emails enviados (automaticos e manuais) aparecem aqui' : 'Filtre por status, tipo ou pedido'}
        </p>
      </div>
    );
  };

  // =====================================================================
  // RENDER: LEFT LIST PANEL (context-dependent)
  // =====================================================================
  const renderLeftPanel = () => {
    if (isImapView) return renderImapList();
    if (activeView === 'sent') return renderSentList();
    if (activeView === 'debug') return renderDebugList();
    return renderImapList();
  };

  // =====================================================================
  // MAIN RENDER
  // =====================================================================
  return (
    <div className="h-[calc(100vh-110px)] min-h-[550px] flex bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm relative">
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      {renderSidebar()}
      {renderLeftPanel()}
      {renderRightPanel()}
    </div>
  );
}
