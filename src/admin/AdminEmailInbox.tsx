import React, { useState, useEffect, useRef } from 'react';
import { adminFetch, MEDUSA_URL } from './adminApi';
import {
  Mail, Inbox, Send, RefreshCw, ArrowLeft, Reply, Loader2,
  Paperclip, ChevronLeft, ChevronRight, Eye, AlertCircle, X,
  CheckCircle2
} from 'lucide-react';

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

function formatEmailDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('pt-BR');
}

function senderDisplay(from: { name: string; address: string }[]): string {
  if (!from.length) return 'Desconhecido';
  const f = from[0];
  return f.name || f.address;
}

// Clean HTML for safe iframe rendering
function sanitizeEmailHtml(html: string): string {
  // Replace external tracking pixels and scripts
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '');
}

async function emailFetch(path: string) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Não autenticado');
  const res = await fetch(`${MEDUSA_URL}/admin/email${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (res.status === 401) throw new Error('Sessão expirada');
  return res.json();
}

async function emailPost(body: any) {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Não autenticado');
  const res = await fetch(`${MEDUSA_URL}/admin/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function AdminEmailInbox() {
  const [view, setView] = useState<'list' | 'read' | 'compose'>('list');
  const [folder, setFolder] = useState('INBOX');
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentEmail, setCurrentEmail] = useState<EmailFull | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);

  // Compose state
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeReplyTo, setComposeReplyTo] = useState<string | null>(null);
  const [composeReferences, setComposeReferences] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, []);

  // Load emails on folder/page change
  useEffect(() => {
    loadEmails();
  }, [folder, page]);

  const loadFolders = async () => {
    try {
      const data = await emailFetch('?action=folders');
      if (data.success) setFolders(data.folders);
    } catch (err: any) {
      console.error('Folders error:', err);
    }
  };

  const loadEmails = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await emailFetch(`?folder=${encodeURIComponent(folder)}&page=${page}&limit=20`);
      if (data.success) {
        setEmails(data.emails);
        setTotal(data.total);
        setPages(data.pages);
      } else {
        setError(data.error || 'Erro ao carregar emails');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexão');
    }
    setLoading(false);
  };

  const openEmail = async (uid: number) => {
    setLoadingEmail(true);
    setView('read');
    try {
      const data = await emailFetch(`?action=read&uid=${uid}&folder=${encodeURIComponent(folder)}`);
      if (data.success) {
        setCurrentEmail(data.email);
        // Mark as read in local state
        setEmails(prev => prev.map(e => e.uid === uid ? { ...e, seen: true } : e));
      } else {
        setError(data.error || 'Erro ao abrir email');
        setView('list');
      }
    } catch (err: any) {
      setError(err.message);
      setView('list');
    }
    setLoadingEmail(false);
  };

  const startReply = () => {
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
    const quotedBody = quoteText.split('\n').map(l => `> ${l}`).join('\n');
    setComposeBody(`\n\n--- Em ${quoteDate}, ${quoteSender} escreveu ---\n${quotedBody}`);

    setView('compose');
    setSendResult(null);
  };

  const startCompose = () => {
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setComposeReplyTo(null);
    setComposeReferences(null);
    setView('compose');
    setSendResult(null);
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
          setView('list');
          setSendResult(null);
          // Reload if we're in Sent folder
          if (folder.toLowerCase().includes('sent')) loadEmails();
        }, 1500);
      } else {
        setSendResult({ success: false, message: data.error || 'Erro ao enviar' });
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err.message });
    }
    setSending(false);
  };

  // Render email body in iframe for safety
  useEffect(() => {
    if (view === 'read' && currentEmail && iframeRef.current) {
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
              body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size: 14px; color: #333; margin: 12px; line-height: 1.6; }
              img { max-width: 100%; height: auto; }
              a { color: #059669; }
              pre { white-space: pre-wrap; word-break: break-word; }
            </style>
          </head><body>${content}</body></html>
        `);
        doc.close();

        // Auto-resize iframe
        setTimeout(() => {
          if (iframeRef.current?.contentDocument?.body) {
            const h = iframeRef.current.contentDocument.body.scrollHeight;
            iframeRef.current.style.height = Math.max(200, Math.min(h + 40, 600)) + 'px';
          }
        }, 200);
      }
    }
  }, [view, currentEmail]);

  // Determine display folders
  const displayFolders = [
    { path: 'INBOX', label: 'Recebidos', icon: Inbox },
    { path: 'Sent', label: 'Enviados', icon: Send },
  ];

  // Find matching folder from actual IMAP folders
  const getSentPath = (): string => {
    const sent = folders.find(f => f.specialUse === '\\Sent' || f.path === 'Sent' || f.name === 'Sent');
    return sent?.path || 'Sent';
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {view !== 'list' && (
            <button
              onClick={() => { setView('list'); setCurrentEmail(null); }}
              className="p-2 rounded-xl hover:bg-zinc-100 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <Mail size={18} className="text-blue-600" />
            <h2 className="text-sm font-bold text-zinc-900">
              {view === 'compose' ? 'Nova Mensagem' : view === 'read' ? 'Mensagem' : 'Caixa de Email'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {view === 'list' && (
            <>
              <button
                onClick={startCompose}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                <Mail size={14} />
                Escrever
              </button>
              <button
                onClick={loadEmails}
                disabled={loading}
                className="p-2 rounded-xl hover:bg-zinc-100 transition-colors text-zinc-500"
                title="Atualizar"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Folder Tabs */}
      {view === 'list' && (
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
          {displayFolders.map(f => {
            const actualPath = f.path === 'Sent' ? getSentPath() : f.path;
            const isActive = folder === actualPath;
            const Icon = f.icon;
            return (
              <button
                key={f.path}
                onClick={() => { setFolder(actualPath); setPage(1); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                  isActive ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <Icon size={14} />
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* EMAIL LIST VIEW */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
              <span className="ml-2 text-sm text-zinc-400">Carregando emails...</span>
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-16">
              <Inbox size={32} className="text-zinc-300 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Nenhum email nesta pasta</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-zinc-50">
                {emails.map(email => (
                  <button
                    key={email.uid}
                    onClick={() => openEmail(email.uid)}
                    className={`w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors flex items-start gap-3 ${
                      !email.seen ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="pt-1.5 shrink-0">
                      {!email.seen ? (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-transparent" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-sm truncate ${!email.seen ? 'font-bold text-zinc-900' : 'font-medium text-zinc-700'}`}>
                          {senderDisplay(folder === 'INBOX' ? email.from : email.to)}
                        </span>
                        <span className="text-[10px] text-zinc-400 shrink-0 tabular-nums">
                          {formatEmailDate(email.date)}
                        </span>
                      </div>
                      <p className={`text-xs truncate ${!email.seen ? 'font-semibold text-zinc-800' : 'text-zinc-600'}`}>
                        {email.subject}
                      </p>
                    </div>

                    {/* Attachment */}
                    {email.hasAttachments && (
                      <Paperclip size={12} className="text-zinc-400 shrink-0 mt-2" />
                    )}
                  </button>
                ))}
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 bg-zinc-50">
                  <span className="text-[10px] text-zinc-400">
                    Pág. {page}/{pages} · {total} emails
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-30"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => setPage(Math.min(pages, page + 1))}
                      disabled={page === pages}
                      className="p-1.5 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-30"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* EMAIL READ VIEW */}
      {view === 'read' && (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          {loadingEmail ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          ) : currentEmail ? (
            <>
              {/* Email header */}
              <div className="p-4 border-b border-zinc-100 space-y-2">
                <h3 className="text-base font-bold text-zinc-900">{currentEmail.subject}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-zinc-400">De: </span>
                    <span className="font-medium text-zinc-700">
                      {currentEmail.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Para: </span>
                    <span className="font-medium text-zinc-700">
                      {currentEmail.to.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ')}
                    </span>
                  </div>
                  {currentEmail.cc.length > 0 && (
                    <div>
                      <span className="text-zinc-400">CC: </span>
                      <span className="text-zinc-600">
                        {currentEmail.cc.map(f => f.address).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">{formatFullDate(currentEmail.date)}</span>
                  {currentEmail.attachments.length > 0 && (
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <Paperclip size={10} />
                      {currentEmail.attachments.length} anexo{currentEmail.attachments.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Email body (iframe for safety) */}
              <div className="border-b border-zinc-100">
                <iframe
                  ref={iframeRef}
                  sandbox="allow-same-origin"
                  className="w-full border-0"
                  style={{ minHeight: '200px', height: '300px' }}
                  title="Email content"
                />
              </div>

              {/* Attachments */}
              {currentEmail.attachments.length > 0 && (
                <div className="px-4 py-3 border-b border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Anexos</p>
                  <div className="flex flex-wrap gap-2">
                    {currentEmail.attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 rounded-lg text-xs text-zinc-600">
                        <Paperclip size={10} />
                        <span className="truncate max-w-[150px]">{att.filename}</span>
                        <span className="text-zinc-400">({Math.round(att.size / 1024)}KB)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="px-4 py-3 flex gap-2">
                <button
                  onClick={startReply}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                  <Reply size={14} />
                  Responder
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* COMPOSE VIEW */}
      {view === 'compose' && (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Para</label>
              <input
                type="email"
                value={composeTo}
                onChange={e => setComposeTo(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Assunto</label>
              <input
                type="text"
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="Assunto do email"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Mensagem</label>
              <textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Escreva sua mensagem..."
                rows={10}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-y"
              />
            </div>

            {sendResult && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                sendResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {sendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {sendResult.message}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={sending || !composeTo || !composeSubject}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {sending ? (
                  <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                ) : (
                  <><Send size={14} /> Enviar</>
                )}
              </button>
              <button
                onClick={() => setView('list')}
                className="px-4 py-2.5 text-zinc-500 rounded-xl text-sm font-medium hover:bg-zinc-100 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
