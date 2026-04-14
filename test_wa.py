import requests
import time

print("Testing WA Proxy via FastAPI")
admin_login = requests.post("http://localhost:8001/api/auth/login", json={
    "email": "adminpalmilha",
    "password": "admin@123"
})
cookies = admin_login.cookies

print("Connecting...")
requests.post("http://localhost:8001/api/admin/whatsapp/connect", cookies=cookies)
time.sleep(3)

print("Status:")
status = requests.get("http://localhost:8001/api/admin/whatsapp/status", cookies=cookies)
print(status.json())

print("QR:")
qr = requests.get("http://localhost:8001/api/admin/whatsapp/qr", cookies=cookies)
print("QR length:", len(qr.json().get('qr', '')))
