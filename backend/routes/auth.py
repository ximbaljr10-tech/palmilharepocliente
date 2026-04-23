import os
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel, Field
from auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from datetime import datetime, timezone

router = APIRouter()


def _cookie_opts():
    """Cookie flags compatíveis com produção (HTTPS) e desenvolvimento."""
    secure = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
    domain = os.environ.get("COOKIE_DOMAIN") or None
    return {
        "httponly": True,
        "secure": secure,
        "samesite": "none" if secure else "lax",
        "path": "/",
        "domain": domain,
    }


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=3, max_length=160)
    password: str = Field(..., min_length=6, max_length=200)


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    db = request.app.mongodb
    email = req.email.lower().strip()

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    access_token = create_access_token(
        str(user["_id"]), user["email"], user.get("role", "professional")
    )
    refresh_token = create_refresh_token(str(user["_id"]))

    opts = _cookie_opts()
    response.set_cookie(key="access_token", value=access_token, max_age=3600, **opts)
    response.set_cookie(
        key="refresh_token", value=refresh_token, max_age=604800, **opts
    )

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
        "name": req.name.strip(),
        "email": email,
        "password_hash": hash_password(req.password),
        "role": "professional",
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.users.insert_one(user_doc)
    user_id = str(res.inserted_id)

    access_token = create_access_token(user_id, email, "professional")
    refresh_token = create_refresh_token(user_id)

    opts = _cookie_opts()
    response.set_cookie(key="access_token", value=access_token, max_age=3600, **opts)
    response.set_cookie(
        key="refresh_token", value=refresh_token, max_age=604800, **opts
    )

    user_doc["_id"] = user_id
    user_doc.pop("password_hash", None)
    return user_doc


@router.post("/logout")
async def logout(response: Response):
    opts = _cookie_opts()
    # delete_cookie não aceita samesite/httponly, usa-se set_cookie com expires=0.
    response.delete_cookie("access_token", path="/", domain=opts.get("domain"))
    response.delete_cookie("refresh_token", path="/", domain=opts.get("domain"))
    return {"status": "ok"}


@router.get("/me")
async def me(request: Request):
    return await get_current_user(request)
