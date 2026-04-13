from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel
from auth_utils import hash_password, verify_password, create_access_token, create_refresh_token, get_current_user
from datetime import datetime, timezone
from bson import ObjectId

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    db = request.app.mongodb
    email = req.email.lower().strip()
    
    # check brute force here if needed
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
        
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
        
    access_token = create_access_token(str(user["_id"]), user["email"], user.get("role", "professional"))
    refresh_token = create_refresh_token(str(user["_id"]))
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    user["_id"] = str(user["_id"])
    user.pop("password_hash", None)
    return user

@router.post("/register")
async def register(req: RegisterRequest, request: Request, response: Response):
    db = request.app.mongodb
    email = req.email.lower().strip()
    
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
        
    user_doc = {
        "name": req.name,
        "email": email,
        "password_hash": hash_password(req.password),
        "role": "professional",
        "created_at": datetime.now(timezone.utc)
    }
    res = await db.users.insert_one(user_doc)
    user_id = str(res.inserted_id)
    
    access_token = create_access_token(user_id, email, "professional")
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    user_doc["_id"] = user_id
    user_doc.pop("password_hash", None)
    return user_doc

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"status": "ok"}

@router.get("/me")
async def me(request: Request):
    user = await get_current_user(request)
    return user
