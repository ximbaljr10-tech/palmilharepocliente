from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from auth_utils import get_current_user
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter()

class PatientCreate(BaseModel):
    name: str
    email: str = None
    phone: str = None
    cpf: str = None
    address: str = None
    city: str = None
    state: str = None

class PatientUpdate(BaseModel):
    cpf: str = None
    address: str = None
    city: str = None
    state: str = None
    email: str = None
    phone: str = None

@router.get("/dashboard")
async def pro_dashboard(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    patients = await db.patients.count_documents({"pro_id": user["_id"]})
    orders = await db.orders.count_documents({"pro_id": user["_id"]})
    recent = await db.orders.find({"pro_id": user["_id"]}).sort("created_at", -1).to_list(10)
    
    # We need patient names for recent orders
    for r in recent:
        r["_id"] = str(r["_id"])
        pat = await db.patients.find_one({"_id": ObjectId(r["patient_id"])})
        r["patient_name"] = pat.get("name") if pat else "Desconhecido"
        # Check if billing is ready to be sent
        r["can_bill"] = bool(pat and pat.get("cpf"))
        
    return {"patients_count": patients, "orders_count": orders, "recent_orders": recent}

@router.get("/patients")
async def get_patients(request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    patients = await db.patients.find({"pro_id": user["_id"]}).to_list(100)
    for p in patients:
        p["_id"] = str(p["_id"])
    return patients

@router.post("/patients")
async def create_patient(req: PatientCreate, request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    doc = req.dict()
    doc["pro_id"] = user["_id"]
    doc["created_at"] = datetime.now(timezone.utc)
    res = await db.patients.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    return doc

@router.put("/patients/{patient_id}")
async def update_patient(patient_id: str, req: PatientUpdate, request: Request, user=Depends(get_current_user)):
    db = request.app.mongodb
    update_doc = {k:v for k,v in req.dict().items() if v is not None}
    if not update_doc: return {"status": "ok"}
    res = await db.patients.update_one({"_id": ObjectId(patient_id), "pro_id": user["_id"]}, {"$set": update_doc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return {"status": "ok"}

