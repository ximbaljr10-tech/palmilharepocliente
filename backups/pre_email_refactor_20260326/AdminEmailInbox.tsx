import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MEDUSA_URL } from './adminApi';
import {
  Mail, Inbox, Send, RefreshCw, ArrowLeft, Reply, Loader2,
  Paperclip, ChevronLeft, ChevronRight, AlertCircle, X,
  CheckCircle2, Edit3, Trash2, Archive, File, Menu, Clock
} from 'lucide-react';

// --- Types ---
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

// --- Cache ---
// Global cache outside component so it persists across unmounts
const emailCache = new Map<string, { emails: EmailSummary[], total: number, pages: number, ts: number }>();
const folderCache: { folders: FolderInfo[], ts: number } = { folders: [], ts: 0 };

// --- Helpers ---
function formatEmailDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' });
}

function senderDisplay(people: { name: string; address: string }[]): string {
  if (!people || !people.length) return 'Desconhecido';
  const p = people[0];
  return p.name || p.address.split('@')[0];
}

function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '');
}

const FOLDER_ICONS: Record<string, any> = {
  '\\Inbox': Inbox,
  '\\Sent': Send,
  '\\Drafts': File,
  '\\Trash': Trash2,
  '\\Archive': Archive,
  '\\Junk': AlertCircle,
};

async function emailFetch(path: string) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Não autenticado');
  const res = await fetch(`${MEDUSA_URL}/admin/email${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Sessão expirada');
  return res.json();
}

async function emailPost(body: any) {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`${MEDUSA_URL}/admin/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function AdminEmailInbox() {
  // State
  const [folders, setFolders] = useState<FolderInfo[]>(folderCache.folders);
  const [activeFolder, setActiveFolder] = useState(() => localStorage.getItem('admin_email_folder') || 'INBOX');
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  
  const [currentEmail, setCurrentEmail] = useState<EmailFull | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Compose State
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeReplyTo, setComposeReplyTo] = useState<string | null>(null);
  const [composeReferences, setComposeReferences] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-fetch folders
  useEffect(() => {
    async function init() {
      if (folderCache.folders.length === 0 || Date.now() - folderCache.ts > 60000) {
        try {
          const res = await emailFetch('?action=folders');
          if (res.success) {
            setFolders(res.folders);
            folderCache.folders = res.folders;
            folderCache.ts = Date.now();
          }
        } catch (e) {
          console.error('Failed to load folders:', e);
        }
      }
    }
    init();
  }, []);

  // Fetch emails
  const loadEmails = useCallback(async (folderPath: string, pageNum: number, forceRefresh = false) => {
    const cacheKey = `${folderPath}-${pageNum}`;
    const cached = emailCache.get(cacheKey);
    
    if (cached && !forceRefresh) {
      setEmails(cached.emails);
      setTotal(cached.total);
      setPages(cached.pages);
      setLoadingInitial(false);
    } else {
      if (!cached) setLoadingInitial(true);
      setLoadingList(true);
    }

    try {
      const data = await emailFetch(`?folder=${encodeURIComponent(folderPath)}&page=${pageNum}&limit=30`);
      if (data.success) {
        setEmails(data.emails);
        setTotal(data.total);
        setPages(data.pages);
        emailCache.set(cacheKey, { emails: data.emails, total: data.total, pages: data.pages, ts: Date.now() });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingList(false);
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('admin_email_folder', activeFolder);
    loadEmails(activeFolder, page, false);
    setCurrentEmail(null);
    setIsComposing(false);
  }, [activeFolder, page, loadEmails]);

  // Open email
  const handleOpenEmail = async (uid: number) => {
    setIsComposing(false);
    setLoadingEmail(true);
    setCurrentEmail(null);
    try {
      const data = await emailFetch(`?action=read&uid=${uid}&folder=${encodeURIComponent(activeFolder)}`);
      if (data.success) {
        setCurrentEmail(data.email);
        // Mark read in local state
        setEmails(prev => {
          const next = prev.map(e => e.uid === uid ? { ...e, seen: true } : e);
          const cacheKey = `${activeFolder}-${page}`;
          const cached = emailCache.get(cacheKey);
          if (cached) emailCache.set(cacheKey, { ...cached, emails: next });
          return next;
        });
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingEmail(false);
  };

  // Compose & Reply
  const startCompose = () => {
    setCurrentEmail(null);
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setComposeReplyTo(null);
    setComposeReferences(null);
    setSendResult(null);
    setIsComposing(true);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const startReply = () => {
    if (!currentEmail) return;
    const from = currentEmail.from[0];
    setComposeTo(from?.address || '');
    setComposeSubject(currentEmail.subject.startsWith('Re:') ? currentEmail.subject : `Re: ${currentEmail.subject}`);
    setComposeReplyTo(currentEmail.messageId);
    setComposeReferences(currentEmail.references ? `${currentEmail.references} ${currentEmail.messageId}` : currentEmail.messageId);
    const quoteDate = formatFullDate(currentEmail.date);
    const quoteSender = senderDisplay(currentEmail.from);
    const quoteText = currentEmail.text || '';
    const quotedBody = quoteText.split('\n').map(l => `> ${l}`).join('\n');
    setComposeBody(`\n\n--- Em ${quoteDate}, ${quoteSender} escreveu ---\n${quotedBody}`);
    setIsComposing(true);
  };

  const handleSend = async () => {
    if (!composeTo || !composeSubject) return;
    setSending(true);
    setSendResult(null);
    try {
      const data = await emailPost({
        to: composeTo,
        subject: composeSubject,
        text: composeBody,
        inReplyTo: composeReplyTo,
        references: composeReferences,
      });
      if (data.success) {
        setSendResult({ success: true, message: 'Email enviado com sucesso!' });
        setTimeout(() => {
          setIsComposing(false);
          setSendResult(null);
          // Invalidate cache for Sent folder
          const sentFolder = folders.find(f => f.specialUse === '\\Sent' || f.name === 'Sent');
          if (sentFolder) {
            emailCache.delete(`${sentFolder.path}-1`);
            if (activeFolder === sentFolder.path) loadEmails(activeFolder, 1, true);
          }
        }, 1500);
      } else {
        setSendResult({ success: false, message: data.error || 'Erro ao enviar' });
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err.message });
    }
    setSending(false);
  };

  // Iframe styling
  useEffect(() => {
    if (currentEmail && !isComposing && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        const content = currentEmail.html
          ? sanitizeEmailHtml(currentEmail.html)
          : `<pre style="font-family:sans-serif;white-space:pre-wrap;word-break:break-word;">${currentEmail.text || ''}</pre>`;
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html><head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size: 14px; color: #1f2937; margin: 0; padding: 16px; line-height: 1.6; }
              img { max-width: 100%; height: auto; border-radius: 8px; }
              a { color: #2563eb; text-decoration: none; }
              a:hover { text-decoration: underline; }
              pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; }
              blockquote { border-left: 3px solid #e5e7eb; margin: 0; padding-left: 16px; color: #6b7280; }
            </style>
          </head><body>${content}</body></html>
        `);
        doc.close();
        setTimeout(() => {
          if (iframeRef.current?.contentDocument?.body) {
            const h = iframeRef.current.contentDocument.body.scrollHeight;
            iframeRef.current.style.height = Math.max(300, h + 40) + 'px';
          }
        }, 100);
      }
    }
  }, [currentEmail, isComposing]);

  // Derived variables
  const activeFolderObj = folders.find(f => f.path === activeFolder) || { name: activeFolder, specialUse: null };
  const isSentFolder = activeFolderObj.specialUse === '\\Sent' || activeFolderObj.name.toLowerCase() === 'sent';

  return (
    <div className="h-[calc(100vh-140px)] min-h-[600px] flex bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm relative">
      
      {/* 1. SIDEBAR (Folders) */}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 absolute lg:relative z-20 w-64 h-full bg-zinc-50 border-r border-zinc-200 flex flex-col transition-transform duration-200`}>
        <div className="p-4">
          <button
            onClick={startCompose}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl font-semibold shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Edit3 size={16} />
            Escrever
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-2">
          {folders.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Carregando pastas...</div>
          ) : (
            <div className="space-y-0.5 px-2">
              {folders.map(f => {
                const Icon = f.specialUse ? (FOLDER_ICONS[f.specialUse] || Mail) : (f.name.toLowerCase() === 'sent' ? Send : f.name.toLowerCase() === 'archive' ? Archive : Mail);
                const isActive = activeFolder === f.path;
                return (
                  <button
                    key={f.path}
                    onClick={() => { setActiveFolder(f.path); setPage(1); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive ? 'bg-blue-100/50 text-blue-700 font-semibold' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-blue-600' : 'text-zinc-400'} />
                    {f.name === 'INBOX' ? 'Recebidos' : f.name === 'Sent' ? 'Enviados' : f.name === 'Drafts' ? 'Rascunhos' : f.name === 'Trash' ? 'Lixeira' : f.name === 'Archive' ? 'Arquivo' : f.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. MESSAGE LIST */}
      <div className={`flex flex-col border-r border-zinc-200 bg-white transition-all duration-200 ${
        currentEmail || isComposing ? 'hidden lg:flex w-[320px] xl:w-[400px]' : 'w-full lg:w-[320px] xl:w-[400px]'
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 bg-white z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-1.5 -ml-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg">
              <Menu size={18} />
            </button>
            <h2 className="font-bold text-zinc-900 truncate">
              {activeFolderObj.name === 'INBOX' ? 'Recebidos' : activeFolderObj.name === 'Sent' ? 'Enviados' : activeFolderObj.name}
            </h2>
          </div>
          <button
            onClick={() => loadEmails(activeFolder, page, true)}
            className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} className={loadingList ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-zinc-50/30">
          {loadingInitial ? (
            <div className="p-8 text-center flex flex-col items-center justify-center text-zinc-400">
              <Loader2 size={24} className="animate-spin mb-3 text-blue-500" />
              <p className="text-sm">Carregando mensagens...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 flex flex-col items-center">
              <Inbox size={32} className="mb-3 opacity-20" />
              <p className="text-sm">Nenhum email aqui</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {emails.map(email => {
                const isActive = currentEmail?.uid === email.uid;
                const showTo = isSentFolder;
                const people = showTo ? email.to : email.from;
                
                return (
                  <button
                    key={email.uid}
                    onClick={() => handleOpenEmail(email.uid)}
                    className={`w-full text-left p-4 transition-colors relative block ${
                      isActive ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'bg-white hover:bg-zinc-50 border-l-2 border-l-transparent'
                    }`}
                  >
                    {!email.seen && !isActive && (
                      <div className="absolute top-4 left-2 w-2 h-2 rounded-full bg-blue-500" />
                    )}
                    <div className="pl-1">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className={`text-sm truncate ${!email.seen && !isActive ? 'font-bold text-zinc-900' : 'font-medium text-zinc-700'}`}>
                          {showTo ? 'Para: ' : ''}{senderDisplay(people)}
                        </span>
                        <span className={`text-[10px] whitespace-nowrap ${isActive ? 'text-blue-600 font-medium' : 'text-zinc-400'}`}>
                          {formatEmailDate(email.date)}
                        </span>
                      </div>
                      <p className={`text-xs truncate mb-1 ${!email.seen && !isActive ? 'font-semibold text-zinc-800' : 'text-zinc-600'}`}>
                        {email.subject}
                      </p>
                      <p className="text-xs text-zinc-400 truncate line-clamp-1">
                        {email.hasAttachments && <Paperclip size={10} className="inline mr-1" />}
                        Clique para ler
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-zinc-200 bg-white">
            <span className="text-xs text-zinc-500 font-medium">
              {page}/{pages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. READING / COMPOSING PANE */}
      <div className={`flex-1 flex flex-col bg-white overflow-hidden ${!currentEmail && !isComposing ? 'hidden lg:flex' : 'flex'}`}>
        
        {isComposing ? (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="flex items-center gap-3 p-4 border-b border-zinc-100">
              <button onClick={() => setIsComposing(false)} className="lg:hidden p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg">
                <ArrowLeft size={18} />
              </button>
              <h3 className="font-bold text-zinc-900">Nova Mensagem</h3>
            </div>
            <div className="p-6 max-w-3xl w-full mx-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">Para</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={e => setComposeTo(e.target.value)}
                  placeholder="email@cliente.com"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">Assunto</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Assunto da mensagem"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
                />
              </div>
              <div className="flex-1 min-h-[300px]">
                <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">Mensagem</label>
                <textarea
                  value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  placeholder="Escreva aqui..."
                  className="w-full h-full min-h-[300px] px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all resize-none"
                />
              </div>

              {sendResult && (
                <div className={`p-3 rounded-xl flex items-center gap-2 text-sm font-medium ${sendResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {sendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {sendResult.message}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSend}
                  disabled={sending || !composeTo || !composeSubject}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Enviar Mensagem
                </button>
                <button
                  onClick={() => setIsComposing(false)}
                  className="px-4 py-2.5 text-zinc-600 font-medium hover:bg-zinc-100 rounded-xl text-sm transition-colors"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        ) : currentEmail ? (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Toolbar */}
            <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-4 py-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentEmail(null)} className="lg:hidden p-2 text-zinc-500 hover:bg-zinc-100 rounded-xl transition-colors">
                  <ArrowLeft size={18} />
                </button>
                <button onClick={startReply} className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 rounded-lg text-sm font-medium transition-colors">
                  <Reply size={16} /> Responder
                </button>
              </div>
              <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                <Clock size={12} />
                {formatFullDate(currentEmail.date)}
              </div>
            </div>

            {/* Headers */}
            <div className="p-6 border-b border-zinc-100">
              <h1 className="text-xl font-bold text-zinc-900 mb-4">{currentEmail.subject}</h1>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                  {currentEmail.from[0]?.name ? currentEmail.from[0].name.charAt(0).toUpperCase() : currentEmail.from[0]?.address.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col">
                    <span className="font-semibold text-zinc-900 text-sm">
                      {currentEmail.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ')}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Para: {currentEmail.to.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Attachments */}
            {currentEmail.attachments.length > 0 && (
              <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Paperclip size={12} /> Anexos ({currentEmail.attachments.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentEmail.attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 shadow-sm hover:border-blue-300 transition-colors cursor-pointer">
                      <File size={14} className="text-blue-500" />
                      <span className="truncate max-w-[200px]">{att.filename}</span>
                      <span className="text-zinc-400 font-normal">({Math.round(att.size / 1024)}KB)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 p-6">
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin allow-popups"
                className="w-full border-0 transition-all duration-300"
                style={{ minHeight: '400px' }}
                title="Email content"
              />
            </div>
          </div>
        ) : loadingEmail ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <Loader2 size={32} className="animate-spin mb-4 text-blue-500" />
            <p className="font-medium text-zinc-600">Abrindo mensagem...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/30">
            <Mail size={48} className="mb-4 text-zinc-200" />
            <p className="font-medium text-zinc-500">Selecione uma mensagem para ler</p>
          </div>
        )}
      </div>

    </div>
  );
}
