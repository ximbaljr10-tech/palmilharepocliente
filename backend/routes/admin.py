from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
from typing import Optional

from auth_utils import get_admin_user
from services import whatsapp_client

router = APIRouter()


class SettingsUpdate(BaseModel):
    mp_access_token: str | None = None
    smtp_host: str | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_port: int | None = None
    admin_phone: str | None = None  # número do admin que recebe notificações


@router.get("/dashboard")
async def admin_dashboard(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    pro_count = await db.users.count_documents({"role": "professional"})
    order_count = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"status": "Pendente"})
    orders = await db.orders.find({}).sort("created_at", -1).to_list(10)
    for o in orders:
        o["_id"] = str(o["_id"])
        if "pro_id" in o:
            o["pro_id"] = str(o["pro_id"])
        if isinstance(o.get("created_at"), datetime):
            o["created_at"] = o["created_at"].isoformat()
        # popula nome do paciente
        try:
            pat = await db.patients.find_one({"_id": ObjectId(o.get("patient_id"))})
            o["patient_name"] = pat.get("name") if pat else "—"
        except Exception:
            o["patient_name"] = "—"
    return {
        "pro_count": pro_count,
        "order_count": order_count,
        "pending_count": pending,
        "recent_orders": orders,
    }


@router.get("/orders")
async def admin_list_orders(
    request: Request,
    status: Optional[str] = None,
    admin=Depends(get_admin_user),
):
    db = request.app.mongodb
    q = {}
    if status:
        q["status"] = status
    orders = await db.orders.find(q).sort("created_at", -1).to_list(500)
    for o in orders:
        o["_id"] = str(o["_id"])
        if isinstance(o.get("created_at"), datetime):
            o["created_at"] = o["created_at"].isoformat()
        try:
            pat = await db.patients.find_one({"_id": ObjectId(o.get("patient_id"))})
            o["patient_name"] = pat.get("name") if pat else "—"
            o["patient_phone"] = pat.get("phone") if pat else ""
        except Exception:
            o["patient_name"] = "—"
        try:
            pro_id_raw = o.get("pro_id")
            pro = None
            if pro_id_raw:
                # pro_id é salvo como string no order; users._id é ObjectId
                try:
                    pro = await db.users.find_one({"_id": ObjectId(pro_id_raw)})
                except Exception:
                    pro = await db.users.find_one({"_id": pro_id_raw})
            o["pro_name"] = pro.get("name") if pro else "—"
            o["pro_email"] = pro.get("email") if pro else ""
        except Exception:
            o["pro_name"] = "—"
            o["pro_email"] = ""
    return orders


@router.get("/orders/{order_id}")
async def admin_order_detail(
    order_id: str, request: Request, admin=Depends(get_admin_user)
):
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")
    o = await db.orders.find_one({"_id": oid})
    if not o:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    o["_id"] = str(o["_id"])
    if isinstance(o.get("created_at"), datetime):
        o["created_at"] = o["created_at"].isoformat()
    try:
        pat = await db.patients.find_one({"_id": ObjectId(o.get("patient_id"))})
        if pat:
            pat["_id"] = str(pat["_id"])
            o["patient"] = pat
    except Exception:
        pass
    try:
        pro_id_raw = o.get("pro_id")
        pro = None
        if pro_id_raw:
            try:
                pro = await db.users.find_one({"_id": ObjectId(pro_id_raw)}, {"password_hash": 0})
            except Exception:
                pro = await db.users.find_one({"_id": pro_id_raw}, {"password_hash": 0})
        if pro:
            pro["_id"] = str(pro["_id"])
            o["professional"] = pro
    except Exception:
        pass
    # anexos (metadados)
    uploads = []
    for uid in o.get("upload_ids", []) or []:
        try:
            up = await db.uploads.find_one({"_id": ObjectId(uid)}, {"data": 0})
            if up:
                up["_id"] = str(up["_id"])
                if isinstance(up.get("created_at"), datetime):
                    up["created_at"] = up["created_at"].isoformat()
                uploads.append(up)
        except Exception:
            pass
    o["uploads"] = uploads
    return o


class StatusUpdate(BaseModel):
    status: str


@router.patch("/orders/{order_id}/status")
async def admin_update_status(
    order_id: str, payload: StatusUpdate, request: Request, admin=Depends(get_admin_user)
):
    db = request.app.mongodb
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="order_id inválido")
    allowed = {"Pendente", "Em produção", "Pronto", "Enviado", "Entregue", "Cancelado", "Cobrança gerada", "Fatura enviada"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"status inválido. Use: {', '.join(sorted(allowed))}")
    res = await db.orders.update_one({"_id": oid}, {"$set": {"status": payload.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return {"status": "ok"}


@router.get("/professionals")
async def get_professionals(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    pros = await db.users.find(
        {"role": "professional"}, {"password_hash": 0}
    ).sort("created_at", -1).to_list(500)
    from datetime import datetime
    for p in pros:
        p["_id"] = str(p["_id"])
        if isinstance(p.get("created_at"), datetime):
            p["created_at"] = p["created_at"].isoformat()
    return pros


@router.get("/settings")
async def get_settings(request: Request, admin=Depends(get_admin_user)):
    db = request.app.mongodb
    settings = await db.settings.find_one({"_id": "global_config"}) or {}
    settings.pop("_id", None)
    if settings.get("smtp_password"):
        settings["smtp_password"] = "********"
    if settings.get("mp_access_token"):
        token = settings["mp_access_token"]
        settings["mp_access_token"] = (
            token[:10] + "..." if len(token) > 10 else "********"
        )
    return settings


@router.post("/settings")
async def update_settings(
    req: SettingsUpdate, request: Request, admin=Depends(get_admin_user)
):
    db = request.app.mongodb
    update_doc = {
        k: v for k, v in req.dict().items() if v is not None and v != "********"
    }
    await db.settings.update_one(
        {"_id": "global_config"}, {"$set": update_doc}, upsert=True
    )
    return {"status": "ok"}


# ---------- WhatsApp bridge (proxy até o serviço no servidor) ----------
@router.get("/whatsapp/status")
async def wa_status(admin=Depends(get_admin_user)):
    return await whatsapp_client.get_status()


@router.get("/whatsapp/qr")
async def wa_qr(admin=Depends(get_admin_user)):
    return await whatsapp_client.get_qr()


@router.post("/whatsapp/connect")
async def wa_connect(admin=Depends(get_admin_user)):
    try:
        return await whatsapp_client.connect()
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/whatsapp/disconnect")
async def wa_disconnect(admin=Depends(get_admin_user)):
    try:
        return await whatsapp_client.disconnect()
    except Exception as e:
        return {"success": False, "error": str(e)}


class TestSendPayload(BaseModel):
    phone: str
    message: str


@router.post("/whatsapp/test-send")
async def wa_test_send(
    payload: TestSendPayload, request: Request, admin=Depends(get_admin_user)
):
    """Envia uma mensagem de teste; útil para validar conexão."""
    try:
        res = await whatsapp_client.send_text(payload.phone, payload.message)
        await request.app.mongodb.whatsapp_logs.insert_one(
            {
                "type": "test",
                "phone": payload.phone,
                "message": payload.message,
                "result": "sent",
                "provider_response": res,
                "created_at": __import__("datetime").datetime.utcnow(),
            }
        )
        return {"success": True, "result": res}
    except Exception as e:
        await request.app.mongodb.whatsapp_logs.insert_one(
            {
                "type": "test",
                "phone": payload.phone,
                "message": payload.message,
                "result": "error",
                "error": str(e),
                "created_at": __import__("datetime").datetime.utcnow(),
            }
        )
        return {"success": False, "error": str(e)}
