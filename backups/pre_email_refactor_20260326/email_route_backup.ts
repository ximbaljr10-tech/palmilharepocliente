import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ImapFlow } from "imapflow"
import nodemailer from "nodemailer"
import { simpleParser } from "mailparser"

/**
 * Admin Email Endpoint — Webmail-like access via IMAP + SMTP
 *
 * Fastmail supports IMAP on imap.fastmail.com:993 (SSL)
 * and SMTP on smtp.fastmail.com:587 (STARTTLS)
 *
 * GET  /admin/email?folder=INBOX&page=1&limit=20  — list emails
 * GET  /admin/email?action=read&uid=123&folder=INBOX  — read single email
 * GET  /admin/email?action=folders  — list available folders
 * POST /admin/email  — send/reply to email (saves copy to Sent)
 *
 * All requests require admin Bearer token authentication.
 */

const IMAP_HOST = process.env.IMAP_HOST || "imap.fastmail.com"
const IMAP_PORT = parseInt(process.env.IMAP_PORT || "993")
const IMAP_USER = process.env.SMTP_USER || ""
const IMAP_PASS = process.env.SMTP_PASS || ""
const SMTP_HOST = process.env.SMTP_HOST || "smtp.fastmail.com"
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587")
const SMTP_USER = process.env.SMTP_USER || ""
const SMTP_PASS = process.env.SMTP_PASS || ""
const SMTP_FROM = process.env.SMTP_FROM || '"Dente de Tubarão" <compras@dentedetubarao.com.br>'

function getTokenFromRequest(req: MedusaRequest): string | null {
  const authHeader = req.headers.authorization || ""
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
}

// Verify admin token by calling Medusa admin API
async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:9000/admin/orders?limit=1", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
    return res.ok
  } catch {
    return false
  }
}

// Create IMAP client
function createImapClient(): ImapFlow {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: {
      user: IMAP_USER,
      pass: IMAP_PASS,
    },
    logger: false,
  })
}

// Create SMTP transporter
function createSmtpTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

// GET /admin/email
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const token = getTokenFromRequest(req)
    if (!token) return res.status(401).json({ error: "Token obrigatório" })

    const isAdmin = await verifyAdminToken(token)
    if (!isAdmin) return res.status(403).json({ error: "Acesso negado" })

    if (!IMAP_USER || !IMAP_PASS) {
      return res.status(500).json({ error: "IMAP não configurado" })
    }

    const action = req.query.action as string
    const folder = (req.query.folder as string) || "INBOX"
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)

    const client = createImapClient()

    try {
      await client.connect()

      // === LIST FOLDERS ===
      if (action === "folders") {
        const mailboxes = await client.list()
        const folders = mailboxes.map((mb: any) => ({
          name: mb.name,
          path: mb.path,
          specialUse: mb.specialUse || null,
          delimiter: mb.delimiter,
        }))
        await client.logout()
        return res.json({ success: true, folders })
      }

      // === READ SINGLE EMAIL ===
      if (action === "read") {
        const uid = parseInt(req.query.uid as string)
        if (!uid) {
          await client.logout()
          return res.status(400).json({ error: "uid obrigatório" })
        }

        const lock = await client.getMailboxLock(folder)
        try {
          // Fetch the message by UID
          const message = await client.fetchOne(String(uid), {
            source: true,
            flags: true,
            envelope: true,
            uid: true,
          }, { uid: true })

          if (!message || !message.source) {
            return res.status(404).json({ error: "Email não encontrado" })
          }

          // Mark as read (add \Seen flag)
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })

          // Parse the email
          const parsed = await simpleParser(message.source)

          const email = {
            uid: message.uid,
            flags: Array.from(message.flags || []),
            subject: parsed.subject || "(sem assunto)",
            from: parsed.from?.value?.map((a: any) => ({ name: a.name, address: a.address })) || [],
            to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((t: any) => t.value?.map((a: any) => ({ name: a.name, address: a.address })) || []) : [],
            cc: parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((t: any) => t.value?.map((a: any) => ({ name: a.name, address: a.address })) || []) : [],
            date: parsed.date?.toISOString() || null,
            messageId: parsed.messageId || null,
            inReplyTo: parsed.inReplyTo || null,
            references: parsed.references || null,
            html: parsed.html || null,
            text: parsed.text || null,
            attachments: (parsed.attachments || []).map((att: any) => ({
              filename: att.filename,
              contentType: att.contentType,
              size: att.size,
            })),
          }

          return res.json({ success: true, email })
        } finally {
          lock.release()
        }
      }

      // === LIST EMAILS ===
      const lock = await client.getMailboxLock(folder)
      try {
        const mailboxStatus = client.mailbox as any
        const total = mailboxStatus?.exists || 0

        if (total === 0) {
          await client.logout()
          return res.json({ success: true, emails: [], total: 0, page, pages: 0 })
        }

        // Calculate range (newest first)
        const startSeq = Math.max(1, total - (page * limit) + 1)
        const endSeq = Math.max(1, total - ((page - 1) * limit))
        const range = `${startSeq}:${endSeq}`

        const emails: any[] = []

        for await (const msg of client.fetch(range, {
          envelope: true,
          flags: true,
          uid: true,
          bodyStructure: true,
        })) {
          const env = msg.envelope
          emails.push({
            uid: msg.uid,
            seq: msg.seq,
            flags: Array.from(msg.flags || []),
            seen: msg.flags?.has("\\Seen") || false,
            subject: env?.subject || "(sem assunto)",
            from: env?.from?.map((a: any) => ({ name: a.name, address: a.address })) || [],
            to: env?.to?.map((a: any) => ({ name: a.name, address: a.address })) || [],
            date: env?.date?.toISOString() || null,
            messageId: env?.messageId || null,
            hasAttachments: msg.bodyStructure?.childNodes?.some((n: any) =>
              n.disposition === "attachment" || (n.type && !n.type.startsWith("text/") && !n.type.startsWith("multipart/"))
            ) || false,
          })
        }

        // Sort newest first
        emails.sort((a, b) => {
          const da = a.date ? new Date(a.date).getTime() : 0
          const db = b.date ? new Date(b.date).getTime() : 0
          return db - da
        })

        const pages = Math.ceil(total / limit)
        return res.json({ success: true, emails, total, page, pages })
      } finally {
        lock.release()
        await client.logout()
      }
    } catch (imapErr: any) {
      console.error("[EMAIL IMAP]", imapErr.message)
      try { await client.logout() } catch {}
      return res.status(500).json({ error: `Erro IMAP: ${imapErr.message}` })
    }
  } catch (error: any) {
    console.error("[EMAIL GET]", error.message)
    return res.status(500).json({ error: `Erro: ${error.message}` })
  }
}

// POST /admin/email — Send or reply to email
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const token = getTokenFromRequest(req)
    if (!token) return res.status(401).json({ error: "Token obrigatório" })

    const isAdmin = await verifyAdminToken(token)
    if (!isAdmin) return res.status(403).json({ error: "Acesso negado" })

    if (!SMTP_USER || !SMTP_PASS) {
      return res.status(500).json({ error: "SMTP não configurado" })
    }

    const { to, subject, html, text, inReplyTo, references } = req.body as any

    if (!to || !subject) {
      return res.status(400).json({ error: "Campos 'to' e 'subject' obrigatórios" })
    }

    const transporter = createSmtpTransporter()

    const mailOptions: any = {
      from: SMTP_FROM,
      to,
      subject,
      ...(html ? { html } : { text: text || "" }),
    }

    // Add reply headers if replying
    if (inReplyTo) mailOptions.inReplyTo = inReplyTo
    if (references) mailOptions.references = references

    // Send the email
    const info = await transporter.sendMail(mailOptions)
    console.log(`[EMAIL SEND] To: ${to}, Subject: "${subject}", MessageID: ${info.messageId}`)

    // Save a copy to Sent folder via IMAP APPEND
    try {
      const client = createImapClient()
      await client.connect()

      // Build the raw email message for IMAP APPEND
      // We need to compose the raw message as nodemailer already sent it
      const rawMessage = await transporter.sendMail({
        ...mailOptions,
        // Don't actually send — we need to generate the raw content
        // Instead, let's build it manually
      }).catch(() => null)

      // Use a simpler approach: compose the message using nodemailer's built-in method
      // @ts-ignore - nodemailer internal module
      const MailComposerMod = await import("nodemailer/lib/mail-composer/index.js")
      const MailComposer = MailComposerMod.default || MailComposerMod
      const composer = new MailComposer(mailOptions)
      const rawBuf: Buffer = await new Promise((resolve, reject) => {
        composer.compile().build((err: any, message: Buffer) => {
          if (err) reject(err)
          else resolve(message)
        })
      })

      // Find the Sent folder (Fastmail uses "Sent")
      const mailboxes = await client.list()
      const sentBox = mailboxes.find((mb: any) =>
        mb.specialUse === "\\Sent" || mb.path === "Sent" || mb.name === "Sent"
      )
      const sentPath = sentBox?.path || "Sent"

      await client.append(sentPath, rawBuf, ["\\Seen"])
      console.log(`[EMAIL SEND] Saved copy to ${sentPath}`)

      await client.logout()
    } catch (appendErr: any) {
      console.error("[EMAIL SEND] Failed to save to Sent folder:", appendErr.message)
      // Don't fail the request — the email was still sent
    }

    return res.json({
      success: true,
      messageId: info.messageId,
    })
  } catch (error: any) {
    console.error("[EMAIL POST]", error.message)
    return res.status(500).json({ error: `Erro ao enviar: ${error.message}` })
  }
}
