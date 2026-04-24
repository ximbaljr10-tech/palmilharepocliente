"""
Orders + faturas (invoices) — schema rico para Axiom 3DPÉ.

Modelo do pedido:
{
    pro_id, patient_id,
    status, price, created_at,
    prescription: {
        tipo_calcado:  "TENIS" | "SAPATO_INTEIRA" | ...,
        numeracao:     "41",
        tipo_modelo:   "SOFT_AZUL" | ... ,
        tipo_revestimento: "EVA" | ...,
        revestimento_eva:  "EVA_AZUL" | ... ,
        details: {
            left:  { CIC: {enabled, value}, CAVR: {...}, ... },
            right: { ... }
        },
        observacao: "texto livre",
        patient_snapshot: { ... cópia do paciente no momento da prescrição ... }
    },
    upload_ids: [ ... ids de fotos/vídeos ... ],
    payment_link, invoice_sent_at
}

Fluxo WhatsApp (send-invoice) mantido.
Novo: GET /{id}/pdf  →  PDF completo para fabricação.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Dict, List

from bson import ObjectId
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field

from auth_utils import get_current_user
from services import whatsapp_client
from services.whatsapp_client import WhatsAppError

router = APIRouter()
log = logging.getLogger("orders")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class SpecValue(BaseModel):
    enabled: bool = False
    value: str = ""  # medida / observação curta (ex. "3mm")


class SideDetails(BaseModel):
    CIC: SpecValue = SpecValue()
    CAVR: SpecValue = SpecValue()
    CAVR_TOTAL: SpecValue = SpecValue()
    CAVR_PROLONGADA: SpecValue = SpecValue()
    CAVL: SpecValue = SpecValue()
    CAVL_TOTAL: SpecValue = SpecValue()
    CAVL_PROLONGADA: SpecValue = SpecValue()
    BRC: SpecValue = SpecValue()
    BOTON: SpecValue = SpecValue()
    BIC: SpecValue = SpecValue()
    ARCO_LONGITUDINAL: SpecValue = SpecValue()


class PrescriptionData(BaseModel):
    tipo_calcado: Optional[str] = None
    numeracao: Optional[str] = None
    tipo_modelo: Optional[str] = None
    tipo_revestimento: Optional[str] = None
    revestimento_eva: Optional[str] = None
    details: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = None  # {left:{...}, right:{...}}
    observacao: Optional[str] = None


class OrderCreate(BaseModel):
    patient_id: str
    prescription: PrescriptionData = PrescriptionData()
    upload_ids: Optional[List[str]] = None
    price: Optional[float] = None

    # Legacy / compat — aceitamos os campos antigos mas eles nao sao obrigatorios
    shoe_size: Optional[str] = None
    foot_type: Optional[str] = None
    pathology: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _serialize_order(o: Dict[str, Any]) -> Dict[str, Any]:
    o["_id"] = str(o["_id"])
    for k in ("created_at", "invoice_sent_at"):
        v = o.get(k)
        if isinstance(v, datetime):
            o[k] = v.isoformat()
    return o


async def _load_patient(db, patient_id: str, pro_id: Optional[str] = None):
    try:
        q: Dict[str, Any] = {"_id": ObjectId(patient_id)}
        if pro_id:
            q["pro_id"] = pro_id
        return await db.patients.find_one(q)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
@router.post("/")
async def create_order(
    req: OrderCreate, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    patient = await _load_patient(db, req.patient_id, pro_id=user["_id"])
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    presc = req.prescription.model_dump() if req.prescription else {}
    # snapshot do paciente no momento da prescricao (para PDF & historico)
    presc["patient_snapshot"] = {
        "name":    patient.get("name"),
        "age":     patient.get("age"),
        "phone":   patient.get("phone"),
        "email":   patient.get("email"),
        "cpf":     patient.get("cpf"),
        "address": patient.get("address"),
        "city":    patient.get("city"),
        "state":   patient.get("state"),
    }

    doc = {
        "pro_id":      user["_id"],
        "patient_id":  req.patient_id,
        "prescription": presc,
        "status":      "Pendente",
        "price":       float(req.price) if req.price else 250.00,
        "created_at":  datetime.now(timezone.utc),
        "payment_link": None,
        "invoice_sent_at": None,
        "upload_ids":  req.upload_ids or [],
        # legacy/compat
        "shoe_size":   req.shoe_size or presc.get("numeracao") or "",
        "foot_type":   req.foot_type or "",
        "pathology":   req.pathology or "",
        "notes":       req.notes or presc.get("observacao") or "",
    }
    res = await db.orders.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    return _serialize_order(doc)


@router.get("/")
async def list_orders(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    orders = (
        await db.orders.find({"pro_id": user["_id"]})
        .sort("created_at", -1)
        .to_list(500)
    )
    # popula paciente
    for o in orders:
        _serialize_order(o)
        try:
            pat = await db.patients.find_one({"_id": ObjectId(o["patient_id"])})
            o["patient_name"] = pat.get("name") if pat else "—"
            o["patient_phone"] = pat.get("phone") if pat else ""
        except Exception:
            o["patient_name"] = "—"
    return orders


@router.get("/{order_id}")
async def get_order(
    order_id: str, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")
    q: Dict[str, Any] = {"_id": oid}
    if user.get("role") != "admin":
        q["pro_id"] = user["_id"]
    o = await db.orders.find_one(q)
    if not o:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    _serialize_order(o)
    # busca paciente atual
    try:
        pat = await db.patients.find_one({"_id": ObjectId(o["patient_id"])})
        if pat:
            pat["_id"] = str(pat["_id"])
            o["patient"] = pat
    except Exception:
        pass
    # lista uploads (metadados)
    ups: List[Dict[str, Any]] = []
    for uid in o.get("upload_ids", []) or []:
        try:
            up = await db.uploads.find_one({"_id": ObjectId(uid)}, {"data": 0})
            if up:
                up["_id"] = str(up["_id"])
                if isinstance(up.get("created_at"), datetime):
                    up["created_at"] = up["created_at"].isoformat()
                ups.append(up)
        except Exception:
            pass
    o["uploads"] = ups
    return o


@router.patch("/{order_id}")
async def update_order(
    order_id: str,
    req: OrderCreate,
    request: Request,
    user=Depends(get_current_user),
):
    """Atualiza prescription / uploads de um pedido existente."""
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")
    q: Dict[str, Any] = {"_id": oid}
    if user.get("role") != "admin":
        q["pro_id"] = user["_id"]
    o = await db.orders.find_one(q)
    if not o:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    update: Dict[str, Any] = {}
    if req.prescription:
        presc = req.prescription.model_dump()
        presc["patient_snapshot"] = (o.get("prescription") or {}).get(
            "patient_snapshot"
        ) or {}
        update["prescription"] = presc
    if req.upload_ids is not None:
        update["upload_ids"] = req.upload_ids
    if req.price is not None:
        update["price"] = float(req.price)

    if update:
        await db.orders.update_one({"_id": oid}, {"$set": update})
    o2 = await db.orders.find_one({"_id": oid})
    return _serialize_order(o2)


# ---------------------------------------------------------------------------
# PDF — laudo completo para fabricação
# ---------------------------------------------------------------------------
@router.get("/{order_id}/pdf")
async def order_pdf(
    order_id: str, request: Request, user=Depends(get_current_user)
):
    """
    Gera PDF do pedido com todos os dados do paciente, prescrição e lista
    de fotos/vídeos anexados. Admin OU dono.
    """
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")
    q: Dict[str, Any] = {"_id": oid}
    if user.get("role") != "admin":
        q["pro_id"] = user["_id"]
    o = await db.orders.find_one(q)
    if not o:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    pat = await db.patients.find_one({"_id": ObjectId(o["patient_id"])}) or {}
    pro_id_raw = o.get("pro_id")
    pro = None
    if pro_id_raw:
        try:
            pro = await db.users.find_one({"_id": ObjectId(pro_id_raw)})
        except Exception:
            pro = await db.users.find_one({"_id": pro_id_raw})
    pro = pro or {}
    uploads: List[Dict[str, Any]] = []
    for uid in o.get("upload_ids", []) or []:
        try:
            up = await db.uploads.find_one(
                {"_id": ObjectId(uid)}, {"data": 0}
            )
            if up:
                uploads.append(up)
        except Exception:
            pass

    # geração via reportlab
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        PageBreak,
    )
    from reportlab.lib.units import mm

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Pedido {order_id}",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "h1",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=colors.HexColor("#0f766e"),
        spaceAfter=4,
    )
    h2 = ParagraphStyle(
        "h2",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#111827"),
        spaceBefore=10,
        spaceAfter=4,
    )
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=9, leading=12)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=14)

    story = []

    # Header
    story.append(Paragraph("AXIOM / 3DPÉ — Laudo de Prescrição", h1))
    story.append(
        Paragraph(
            f"Pedido <b>#{order_id[-8:].upper()}</b> &nbsp;|&nbsp; "
            f"Emitido em {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}",
            small,
        )
    )
    story.append(Spacer(1, 6))

    # Paciente
    story.append(Paragraph("Dados do paciente", h2))
    rows = [
        ["Nome",      pat.get("name", "—")],
        ["Idade",     str(pat.get("age", "—"))],
        ["Telefone",  pat.get("phone", "—") or "—"],
        ["E-mail",    pat.get("email", "—") or "—"],
        ["CPF",       pat.get("cpf", "—") or "—"],
        ["Endereço",  pat.get("address", "—") or "—"],
        ["Cidade/UF", f"{pat.get('city','—')}/{pat.get('state','—')}"],
    ]
    t = Table(rows, colWidths=[38 * mm, 130 * mm])
    t.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(t)

    # Profissional solicitante
    story.append(Paragraph("Profissional solicitante", h2))
    rows2 = [
        ["Nome",     pro.get("name", "—")],
        ["E-mail",   pro.get("email", "—")],
    ]
    t2 = Table(rows2, colWidths=[38 * mm, 130 * mm])
    t2.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(t2)

    # Prescrição — modelo
    presc = o.get("prescription") or {}
    story.append(Paragraph("Prescrição — Modelo da palmilha", h2))
    presc_rows = [
        ["Tipo de calçado", presc.get("tipo_calcado", "—") or "—"],
        ["Numeração",       presc.get("numeracao", "—") or "—"],
        ["Tipo de modelo",  presc.get("tipo_modelo", "—") or "—"],
        ["Tipo de revestimento", presc.get("tipo_revestimento", "—") or "—"],
        ["Revestimento EVA", presc.get("revestimento_eva", "—") or "—"],
    ]
    t3 = Table(presc_rows, colWidths=[48 * mm, 120 * mm])
    t3.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(t3)

    # Detalhes por pé
    details = presc.get("details") or {}
    left = details.get("left") or {}
    right = details.get("right") or {}
    SPEC_LIST = [
        ("CIC", "CIC"),
        ("CAVR", "CAVR"),
        ("CAVR_TOTAL", "CAVR total"),
        ("CAVR_PROLONGADA", "CAVR prolongada"),
        ("CAVL", "CAVL"),
        ("CAVL_TOTAL", "CAVL total"),
        ("CAVL_PROLONGADA", "CAVL prolongada"),
        ("BRC", "BRC"),
        ("BOTON", "Botón"),
        ("BIC", "BIC"),
        ("ARCO_LONGITUDINAL", "ARCO longitudinal"),
    ]

    def side_table(side: Dict[str, Any], title: str):
        body_rows = [[title, "Marcado", "Valor"]]
        for key, label in SPEC_LIST:
            item = side.get(key) or {}
            if isinstance(item, dict):
                en = "SIM" if item.get("enabled") else "—"
                val = item.get("value") or ""
            else:
                en = "—"; val = ""
            body_rows.append([label, en, val])
        tbl = Table(body_rows, colWidths=[54 * mm, 18 * mm, 30 * mm])
        tbl.setStyle(
            TableStyle(
                [
                    ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                    ("ALIGN", (1, 1), (-1, -1), "CENTER"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        return tbl

    story.append(Paragraph("Prescrição — Detalhes técnicos por pé", h2))
    side_row = Table(
        [[side_table(left, "PÉ ESQUERDO"), side_table(right, "PÉ DIREITO")]],
        colWidths=[82 * mm, 82 * mm],
    )
    side_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(side_row)

    # Observações
    if presc.get("observacao"):
        story.append(Paragraph("Observações", h2))
        story.append(Paragraph(presc["observacao"], body))

    # Anexos
    if uploads:
        story.append(Paragraph("Anexos (fotos / vídeos)", h2))
        rows_u = [["Arquivo", "Tipo", "Tamanho"]]
        for u in uploads:
            size_kb = int((u.get("size") or 0) / 1024)
            rows_u.append(
                [u.get("filename", "—"), u.get("content_type", "—"), f"{size_kb} KB"]
            )
        tu = Table(rows_u, colWidths=[90 * mm, 50 * mm, 28 * mm])
        tu.setStyle(
            TableStyle(
                [
                    ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(tu)
        story.append(
            Paragraph(
                "<i>Os anexos podem ser baixados diretamente no painel admin.</i>",
                small,
            )
        )

    # Rodapé
    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            f"<i>Valor de referência: R$ {float(o.get('price') or 0):.2f} &nbsp;|&nbsp; "
            f"Status: {o.get('status','—')}</i>",
            small,
        )
    )

    doc.build(story)
    buf.seek(0)

    fname = f"pedido_{order_id[-8:].upper()}.pdf"
    return Response(
        content=buf.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---------------------------------------------------------------------------
# Billing (PIX) — mantido
# ---------------------------------------------------------------------------
@router.post("/{order_id}/billing")
async def generate_billing(
    order_id: str, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")

    order = await db.orders.find_one({"_id": oid, "pro_id": user["_id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    patient = await db.patients.find_one({"_id": ObjectId(order["patient_id"])})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    if not patient.get("cpf") or not patient.get("email") or not patient.get("phone"):
        return {
            "needs_completion": True,
            "patient": {
                "_id": str(patient["_id"]),
                "cpf": patient.get("cpf", ""),
                "email": patient.get("email", ""),
                "phone": patient.get("phone", ""),
                "address": patient.get("address", ""),
            },
        }

    settings = await db.settings.find_one({"_id": "global_config"}) or {}
    mp_link = None
    if settings.get("mp_access_token"):
        try:
            import requests
            headers = {
                "Authorization": f'Bearer {settings["mp_access_token"]}',
                "Content-Type": "application/json",
                "x-idempotency-key": str(uuid.uuid4()),
            }
            cpf_clean = "".join(filter(str.isdigit, patient.get("cpf", "")))
            payload = {
                "transaction_amount": float(order["price"]),
                "description": f"Palmilha Axiom - {patient['name']}",
                "payment_method_id": "pix",
                "payer": {
                    "email": patient.get("email"),
                    "first_name": patient["name"].split()[0],
                    "identification": {"type": "CPF", "number": cpf_clean},
                },
            }
            resp = requests.post(
                "https://api.mercadopago.com/v1/payments",
                json=payload,
                headers=headers,
                timeout=8,
            )
            if resp.status_code in (200, 201):
                mp_link = (
                    resp.json()
                    .get("point_of_interaction", {})
                    .get("transaction_data", {})
                    .get("qr_code")
                )
            else:
                log.warning("MP response %s: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            log.exception("MP error: %s", e)

    if not mp_link:
        mp_link = f"000201PLACEHOLDER_{order_id}"

    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"payment_link": mp_link, "status": "Cobrança gerada"}},
    )
    return {"status": "ok", "payment_link": mp_link}


# ---------------------------------------------------------------------------
# Send invoice via WhatsApp — mantido
# ---------------------------------------------------------------------------
class SendInvoicePayload(BaseModel):
    force: bool = False


@router.post("/{order_id}/send-invoice")
async def send_invoice(
    order_id: str,
    payload: SendInvoicePayload = SendInvoicePayload(),
    request: Request = None,
    user=Depends(get_current_user),
):
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")

    query: Dict[str, Any] = {"_id": oid}
    if user.get("role") != "admin":
        query["pro_id"] = user["_id"]

    order = await db.orders.find_one(query)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    last_sent = order.get("invoice_sent_at")
    if last_sent and not payload.force:
        last_dt = last_sent if isinstance(last_sent, datetime) else datetime.fromisoformat(str(last_sent))
        if datetime.now(timezone.utc) - last_dt < timedelta(seconds=60):
            raise HTTPException(
                status_code=429,
                detail="Fatura já enviada recentemente. Aguarde 60s ou use force=true.",
            )

    if not order.get("payment_link"):
        raise HTTPException(
            status_code=400,
            detail="Gere a cobrança (payment_link) antes de enviar a fatura.",
        )

    patient = await db.patients.find_one({"_id": ObjectId(order["patient_id"])})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    phone = patient.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Paciente sem telefone cadastrado.")

    first = (patient.get("name") or "cliente").split()[0]
    msg = (
        f"Olá {first}! Seu pedido de palmilha Axiom está pronto para pagamento.\n\n"
        f"Valor: R$ {float(order['price']):.2f}\n\n"
        f"Copie o código PIX abaixo para pagar:\n\n{order['payment_link']}\n\n"
        f"Qualquer dúvida, responda esta mensagem."
    )

    log_doc = {
        "type": "invoice",
        "order_id": str(order["_id"]),
        "pro_id": order.get("pro_id"),
        "phone": phone,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        res = await whatsapp_client.send_text(phone, msg)
    except WhatsAppError as e:
        log_doc.update({"result": "error", "error": str(e)})
        await db.whatsapp_logs.insert_one(log_doc)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        log_doc.update({"result": "error", "error": str(e)})
        await db.whatsapp_logs.insert_one(log_doc)
        raise HTTPException(status_code=502, detail=f"Erro na ponte WhatsApp: {e}")

    now = datetime.now(timezone.utc)
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"invoice_sent_at": now, "status": "Fatura enviada"}},
    )
    log_doc.update({"result": "sent", "provider_response": res})
    await db.whatsapp_logs.insert_one(log_doc)

    return {"status": "ok", "sent_at": now.isoformat(), "provider_response": res}


@router.get("/{order_id}/logs")
async def order_logs(
    order_id: str, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    logs = (
        await db.whatsapp_logs.find({"order_id": order_id})
        .sort("created_at", -1)
        .to_list(50)
    )
    for l in logs:
        l["_id"] = str(l["_id"])
        if isinstance(l.get("created_at"), datetime):
            l["created_at"] = l["created_at"].isoformat()
    return logs
