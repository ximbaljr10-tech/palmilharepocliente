import uuid
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from auth_utils import get_current_user
from bson import ObjectId
from datetime import datetime, timezone
import httpx

router = APIRouter()

class OrderCreate(BaseModel):
    patient_id: str
    shoe_size: str
    foot_type: str  # Neutral, Pronated, Supinated
    pathology: str = None
    weight: str = None
    height: str = None
    activity_level: str = None
    baropodometry_data: str = None # base64 or link
    notes: str = None

@router.post("/")
async def create_order(req: OrderCreate, request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    patient = await db.patients.find_one({"_id": ObjectId(req.patient_id), "pro_id": user["_id"]})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
        
    doc = req.dict()
    doc["pro_id"] = user["_id"]
    doc["status"] = "Pendente"
    doc["price"] = 250.00 # Fixed base price
    doc["created_at"] = datetime.now(timezone.utc)
    
    # Check Mercado Pago Settings
    settings = await db.settings.find_one({"_id": "global_config"})
    mp_link = None
    if settings and settings.get("mp_access_token"):
        # Integrate Mercado Pago (mocked call or real if valid)
        try:
            import requests
            headers = {
                'Authorization': f'Bearer {settings["mp_access_token"]}',
                'Content-Type': 'application/json',
                'x-idempotency-key': str(uuid.uuid4())
            }
            payload = {
                "transaction_amount": float(doc["price"]),
                "description": f"Palmilha Axiom - {patient['name']}",
                "payment_method_id": "pix",
                "payer": {
                    "email": patient.get("email") or "cliente@axiom.com",
                    "first_name": patient['name'].split()[0],
                }
            }
            resp = requests.post("https://api.mercadopago.com/v1/payments", json=payload, headers=headers, timeout=5)
            if resp.status_code in (200, 201):
                mp_link = resp.json().get("point_of_interaction", {}).get("transaction_data", {}).get("qr_code")
        except Exception as e:
            print("MP Error", e)
            
    doc["payment_link"] = mp_link or "Aguardando geração de cobrança"
    
    res = await db.orders.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    
    # Notify Admin via WhatsApp Service (if configured)
    if settings and settings.get("wa_service_url"):
        try:
            admin_phone = "5511999999999" # Hardcoded or from settings
            msg = f"Novo pedido de palmilha de {user.get('name')}. Paciente: {patient['name']}. Status: Pendente."
            async with httpx.AsyncClient() as client:
                await client.post(f"{settings['wa_service_url']}/send", json={"phone_number": admin_phone, "message": msg}, timeout=2)
        except Exception:
            pass
            
    return doc

@router.get("/")
async def list_orders(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    orders = await db.orders.find({"pro_id": user["_id"]}).sort("created_at", -1).to_list(100)
    for o in orders:
        o["_id"] = str(o["_id"])
        o["patient_id"] = str(o["patient_id"])
    return orders
