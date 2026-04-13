import requests

BASE_URL = "http://localhost:8001/api"

print("--- Testing Registration ---")
reg_res = requests.post(f"{BASE_URL}/auth/register", json={
    "name": "Test Pro",
    "email": "testpro@example.com",
    "password": "password123"
})
print("Register:", reg_res.status_code, reg_res.text)

print("\n--- Testing Login (Pro) ---")
login_res = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "testpro@example.com",
    "password": "password123"
})
print("Login Pro:", login_res.status_code)
cookies = login_res.cookies

print("\n--- Testing Pro Dashboard ---")
pro_dash = requests.get(f"{BASE_URL}/pro/dashboard", cookies=cookies)
print("Pro Dash:", pro_dash.status_code, pro_dash.text)

print("\n--- Testing Admin Login ---")
admin_login = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "adminpalmilha",
    "password": "admin@123"
})
print("Admin Login:", admin_login.status_code)
admin_cookies = admin_login.cookies

print("\n--- Testing Admin Dashboard ---")
admin_dash = requests.get(f"{BASE_URL}/admin/dashboard", cookies=admin_cookies)
print("Admin Dash:", admin_dash.status_code, admin_dash.text)

