import requests
import sys
from datetime import datetime
import json

class AxiomAPITester:
    def __init__(self, base_url="http://localhost:8001"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_cookies = None
        self.pro_cookies = None
        self.test_patient_id = None
        self.test_order_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, cookies=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if headers:
            req_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=req_headers, cookies=cookies)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=req_headers, cookies=cookies)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=req_headers, cookies=cookies)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.text[:200]}")
                except:
                    pass
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        success, response = self.run_test("Health Check", "GET", "health", 200)
        return success

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "adminpalmilha", "password": "admin@123"}
        )
        if success:
            # Store cookies for future admin requests
            self.admin_cookies = self.session.cookies.get_dict()
            print(f"   Admin logged in successfully")
        return success

    def test_professional_registration(self):
        """Test professional registration"""
        test_email = f"test_pro_{datetime.now().strftime('%H%M%S')}@test.com"
        success, response = self.run_test(
            "Professional Registration",
            "POST",
            "auth/register",
            200,
            data={
                "name": "Dr. Test Professional",
                "email": test_email,
                "password": "TestPass123!"
            }
        )
        if success:
            # Store cookies for future professional requests
            self.pro_cookies = self.session.cookies.get_dict()
            print(f"   Professional registered: {test_email}")
        return success

    def test_admin_dashboard(self):
        """Test admin dashboard access"""
        success, response = self.run_test(
            "Admin Dashboard",
            "GET",
            "admin/dashboard",
            200,
            cookies=self.admin_cookies
        )
        if success and 'pro_count' in response:
            print(f"   Dashboard data: {response.get('pro_count')} professionals, {response.get('order_count')} orders")
        return success

    def test_admin_settings(self):
        """Test admin settings endpoints"""
        # Get settings
        success1, response = self.run_test(
            "Get Admin Settings",
            "GET",
            "admin/settings",
            200,
            cookies=self.admin_cookies
        )
        
        # Update settings
        success2, _ = self.run_test(
            "Update Admin Settings",
            "POST",
            "admin/settings",
            200,
            data={
                "mp_access_token": "TEST_MP_TOKEN_123",
                "wa_service_url": "https://mock-whatsapp-service.com"
            },
            cookies=self.admin_cookies
        )
        
        return success1 and success2

    def test_professional_dashboard(self):
        """Test professional dashboard"""
        success, response = self.run_test(
            "Professional Dashboard",
            "GET",
            "pro/dashboard",
            200,
            cookies=self.pro_cookies
        )
        if success:
            print(f"   Pro dashboard: {response.get('patients_count')} patients, {response.get('orders_count')} orders")
        return success

    def test_create_patient(self):
        """Test patient creation"""
        success, response = self.run_test(
            "Create Patient",
            "POST",
            "pro/patients",
            200,
            data={
                "name": "João Silva Test",
                "email": "joao.test@email.com",
                "phone": "+5511999999999"
            },
            cookies=self.pro_cookies
        )
        if success and '_id' in response:
            self.test_patient_id = response['_id']
            print(f"   Patient created with ID: {self.test_patient_id}")
        return success

    def test_get_patients(self):
        """Test getting patients list"""
        success, response = self.run_test(
            "Get Patients List",
            "GET",
            "pro/patients",
            200,
            cookies=self.pro_cookies
        )
        if success:
            print(f"   Found {len(response)} patients")
        return success

    def test_create_order(self):
        """Test order creation"""
        if not self.test_patient_id:
            print("❌ Cannot test order creation - no patient ID available")
            return False
            
        success, response = self.run_test(
            "Create Order",
            "POST",
            "orders/",
            200,
            data={
                "patient_id": self.test_patient_id,
                "shoe_size": "40",
                "foot_type": "Neutra",
                "pathology": "Fascite Plantar",
                "weight": "75",
                "height": "175",
                "activity_level": "Ativo",
                "baropodometry_data": "mock_base64_data_here",
                "notes": "Teste de criação de pedido"
            },
            cookies=self.pro_cookies
        )
        if success and '_id' in response:
            self.test_order_id = response['_id']
            print(f"   Order created with ID: {self.test_order_id}")
            print(f"   Order price: R$ {response.get('price', 0)}")
            print(f"   Payment link: {response.get('payment_link', 'N/A')[:50]}...")
        return success

    def test_get_orders(self):
        """Test getting orders list"""
        success, response = self.run_test(
            "Get Orders List",
            "GET",
            "orders/",
            200,
            cookies=self.pro_cookies
        )
        if success:
            print(f"   Found {len(response)} orders")
        return success

    def test_auth_me_endpoint(self):
        """Test /auth/me endpoint"""
        success, response = self.run_test(
            "Auth Me (Professional)",
            "GET",
            "auth/me",
            200,
            cookies=self.pro_cookies
        )
        if success:
            print(f"   User: {response.get('name')} ({response.get('role')})")
        return success

    def test_logout(self):
        """Test logout"""
        success, response = self.run_test(
            "Logout",
            "POST",
            "auth/logout",
            200,
            cookies=self.pro_cookies
        )
        return success

def main():
    print("🚀 Starting Axiom Biomechanics API Tests")
    print("=" * 50)
    
    tester = AxiomAPITester()
    
    # Test sequence
    tests = [
        ("Health Check", tester.test_health_check),
        ("Admin Login", tester.test_admin_login),
        ("Admin Dashboard", tester.test_admin_dashboard),
        ("Admin Settings", tester.test_admin_settings),
        ("Professional Registration", tester.test_professional_registration),
        ("Professional Dashboard", tester.test_professional_dashboard),
        ("Auth Me Endpoint", tester.test_auth_me_endpoint),
        ("Create Patient", tester.test_create_patient),
        ("Get Patients", tester.test_get_patients),
        ("Create Order", tester.test_create_order),
        ("Get Orders", tester.test_get_orders),
        ("Logout", tester.test_logout),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} - Exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if failed_tests:
        print(f"❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())