"""
Cliente HTTP para o whatsapp-service (Node/Baileys) que roda no servidor,
fora do Vercel. A comunicação usa um token compartilhado (X-Internal-Token).
"""
from __future__ import annotations

import os
import re
import logging
from typing import Any, Dict, Optional

import httpx

log = logging.getLogger("whatsapp_client")


class WhatsAppError(Exception):
    pass


def _base() -> str:
    url = os.environ.get("WHATSAPP_SERVICE_URL", "").rstrip("/")
    if not url:
        raise WhatsAppError("WHATSAPP_SERVICE_URL não configurado.")
    return url


def _headers() -> Dict[str, str]:
    token = os.environ.get("WHATSAPP_SERVICE_TOKEN", "")
    h = {"Content-Type": "application/json"}
    if token:
        h["X-Internal-Token"] = token
    return h


def normalize_phone_br(raw: str) -> Optional[str]:
    """
    Aceita telefones br em várias formas e normaliza para 55DDDNNNNNNNNN.
    Retorna None se inválido.
    """
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    if not digits.startswith("55"):
        digits = "55" + digits
    # 55 + DDD (2) + 8 ou 9 dígitos => 12 ou 13 no total
    if len(digits) < 12 or len(digits) > 13:
        return None
    return digits


async def get_status(timeout: float = 3.0) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.get(f"{_base()}/status", headers=_headers())
            r.raise_for_status()
            return r.json()
    except Exception as e:
        log.warning("WA status error: %s", e)
        return {"connected": False, "hasQR": False, "error": str(e)}


async def get_qr(timeout: float = 3.0) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.get(f"{_base()}/qr", headers=_headers())
            r.raise_for_status()
            return r.json()
    except Exception as e:
        return {"qr": None, "error": str(e)}


async def connect(timeout: float = 5.0) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(f"{_base()}/connect", headers=_headers())
        r.raise_for_status()
        return r.json()


async def disconnect(timeout: float = 5.0) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(f"{_base()}/disconnect", headers=_headers())
        r.raise_for_status()
        return r.json()


async def send_text(
    phone: str, message: str, timeout: float = 15.0
) -> Dict[str, Any]:
    normalized = normalize_phone_br(phone)
    if not normalized:
        raise WhatsAppError("Número de telefone inválido.")
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(
            f"{_base()}/send",
            json={"phone": normalized, "message": message},
            headers=_headers(),
        )
        if r.status_code >= 400:
            try:
                detail = r.json()
            except Exception:
                detail = {"error": r.text[:300]}
            raise WhatsAppError(
                f"Falha ao enviar mensagem (HTTP {r.status_code}): {detail}"
            )
        return r.json()
