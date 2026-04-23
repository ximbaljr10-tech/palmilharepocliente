"""
Orders + faturas (invoices).

Fluxo da ponte WhatsApp:
  1. Profissional clica "Enviar Fatura" no painel.
  2. Frontend chama POST /api/orders/{id}/send-invoice.
  3. Backend valida: dono, paciente completo (CPF/email/phone), payment_link.
  4. Se não tiver payment_link, backend tenta gerar via MercadoPago (opcional).
  5. Envia mensagem pelo whatsapp_client (ponte HTTP + X-Internal-Token).
  6. Gravamos um whatsapp_logs com sucesso/erro e devolvemos resultado.
  7. Prevenção contra envio duplicado acidental: flag `invoice_sent_at`
     mais checagem de 60s desde último envio.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from services import whatsapp_client
from services.whatsapp_client import WhatsAppError

router = APIRouter()
log = logging.getLogger("orders")


class OrderCreate(BaseModel):
    patient_id: str
    shoe_size: str
    foot_type: str
    pathology: Optional[str] = None
    weight: Optional[str] = None
    height: Optional[str] = None
    activity_level: Optional[str] = None
    baropodometry_data: Optional[str] = None
    notes: Optional[str] = None
    upload_ids: Optional[list[str]] = None


@router.post("/")
async def create_order(
    req: OrderCreate, request: Request, user=Depends(get_current_user)
):
    db = request.app.mongodb
    try:
        pat_oid = ObjectId(req.patient_id)
    except Exception:
        raise HTTPException(status_code=400, detail="patient_id inválido")

    patient = await db.patients.find_one({"_id": pat_oid, "pro_id": user["_id"]})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    doc = req.dict()
    doc["pro_id"] = user["_id"]
    doc["status"] = "Pendente"
    doc["price"] = 250.00
    doc["created_at"] = datetime.now(timezone.utc)
    doc["payment_link"] = None
    doc["invoice_sent_at"] = None
    doc["upload_ids"] = req.upload_ids or []

    res = await db.orders.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    doc["patient_id"] = str(doc["patient_id"])  # ensure string return

    return doc


@router.get("/")
async def list_orders(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    orders = (
        await db.orders.find({"pro_id": user["_id"]})
        .sort("created_at", -1)
        .to_list(200)
    )
    for o in orders:
        o["_id"] = str(o["_id"])
    return orders


@router.post("/{order_id}/billing")
async def generate_billing(
    order_id: str, request: Request, user=Depends(get_current_user)
):
    """
    Gera o link/código PIX (MercadoPago) se configurado. Se não houver token
    MP, devolve um placeholder BR Code didático (sem cobrar ninguém).
    Não dispara WhatsApp aqui — o envio é feito por /send-invoice.
    """
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
        # Placeholder só para fluxo funcional quando token não existe.
        mp_link = f"000201PLACEHOLDER_{order_id}"

    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"payment_link": mp_link, "status": "Cobrança gerada"}},
    )
    return {"status": "ok", "payment_link": mp_link}


class SendInvoicePayload(BaseModel):
    force: bool = False


@router.post("/{order_id}/send-invoice")
async def send_invoice(
    order_id: str,
    payload: SendInvoicePayload = SendInvoicePayload(),
    request: Request = None,
    user=Depends(get_current_user),
):
    """
    Ponte segura para envio da fatura via WhatsApp.
    - Autenticado (cookie httpOnly + JWT).
    - Dono do pedido OU admin.
    - Requer payment_link e telefone válido do paciente.
    - Previne envio duplicado dentro de 60s (a menos que force=true).
    - Registra log em whatsapp_logs.
    """
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")

    query = {"_id": oid}
    if user.get("role") != "admin":
        query["pro_id"] = user["_id"]

    order = await db.orders.find_one(query)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    # Anti-duplicata (janela 60s)
    last_sent = order.get("invoice_sent_at")
    if last_sent and not payload.force:
        if datetime.now(timezone.utc) - (
            last_sent if isinstance(last_sent, datetime) else datetime.fromisoformat(str(last_sent))
        ) < timedelta(seconds=60):
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
        raise HTTPException(
            status_code=400, detail="Paciente sem telefone cadastrado."
        )

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

    # Sucesso
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
