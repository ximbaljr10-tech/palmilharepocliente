"""
Reseta/cria o usuário admin lendo email/senha do backend/.env.

Uso:
    /home/root/venv/bin/python scripts/reset_admin.py

O script é idempotente (pode rodar quantas vezes precisar).
Útil quando você perdeu a senha ou trocou o ADMIN_PASSWORD no .env.
"""
import os
import sys

# Tornar os módulos do backend importáveis
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.normpath(os.path.join(HERE, "..", "backend"))
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(BACKEND, ".env"))

import bcrypt  # noqa: E402
from pymongo import MongoClient  # noqa: E402

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "adminpalmilha")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
DB_NAME = os.environ.get("DB_NAME", "axiom_db")

if not ADMIN_PASSWORD:
    print("ERRO: defina ADMIN_PASSWORD no backend/.env antes de rodar.")
    sys.exit(1)

client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
try:
    client.admin.command("ping")
except Exception as e:
    print(f"ERRO conectando em {MONGO_URL}: {e}")
    sys.exit(2)

db = client[DB_NAME]

# bcrypt tem limite de 72 bytes; trunca pra evitar crash
password_bytes = ADMIN_PASSWORD.encode("utf-8")[:72]
hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")

res = db.users.update_one(
    {"email": ADMIN_EMAIL.lower()},
    {
        "$set": {
            "password_hash": hashed,
            "role": "admin",
            "name": "Administrador",
        }
    },
    upsert=True,
)

print(f"Email:     {ADMIN_EMAIL}")
print(f"Matched:   {res.matched_count}")
print(f"Modified:  {res.modified_count}")
print(f"Upserted:  {res.upserted_id}")
print("OK — admin pronto pra login.")
