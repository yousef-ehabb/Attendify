import requests
import json
import base64
import time
import sqlite3

BASE_URL = "http://127.0.0.1:8000"

def test_health():
    resp = requests.get(f"{BASE_URL}/")
    assert resp.status_code == 200
    print("Health check passed.")

def create_student():
    data = {"name": "Test Student", "email": f"test{int(time.time())}@example.com"}
    resp = requests.post(f"{BASE_URL}/api/students/register", json=data)
    resp.raise_for_status()
    print("Student created:", resp.json()["id"])
    return resp.json()["id"]

def create_session():
    data = {"course_name": "Test Course", "instructor": "Test Instructor"}
    resp = requests.post(f"{BASE_URL}/api/sessions/start", json=data)
    assert resp.status_code == 200, resp.text
    session_id = resp.json()["id"]
    print("Session created:", session_id)
    return session_id

def get_token_from_db(session_id):
    conn = sqlite3.connect("data/attendance.db")
    c = conn.cursor()
    c.execute("SELECT token FROM qr_tokens WHERE session_id = ? ORDER BY created_at DESC LIMIT 1", (session_id,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else None

def test_verify_qr(session_id):
    token = get_token_from_db(session_id)
    assert token is not None, "No token found in DB"
    resp = requests.post(f"{BASE_URL}/api/attend/verify-qr", json={"token": token})
    assert resp.status_code == 200, f"Verify QR failed: {resp.text}"
    print("Verify QR passed.")

def test_fake_qr():
    resp = requests.post(f"{BASE_URL}/api/attend/verify-qr", json={"token": "fake_token_123"})
    assert resp.status_code == 401, f"Expected 401 for fake QR, got {resp.status_code}"
    print("Fake QR rejected correctly.")

def download_test_image():
    # Download a test face image for test purposes
    url = "https://upload.wikimedia.org/wikipedia/commons/e/ed/Elon_Musk_Royal_Society.jpg"
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    with open("test_face.jpg", "wb") as f:
        f.write(resp.content)
    with open("test_face.jpg", "rb") as f:
        return f"data:image/jpeg;base64,{base64.b64encode(f.read()).decode('utf-8')}"

def test_enroll_face(student_id, base64_image):
    # Need 3-5 images as per PLAN
    images = [base64_image, base64_image, base64_image]
    resp = requests.post(f"{BASE_URL}/api/students/{student_id}/enroll-face", json={"images": images})
    assert resp.status_code == 200, resp.text
    print("Face enrolled successfully.")

def test_verify_face(session_id, student_id, base64_image):
    data = {
        "session_id": session_id,
        "student_id": student_id,
        "image": base64_image
    }
    resp = requests.post(f"{BASE_URL}/api/attend/verify-face", json=data)
    assert resp.status_code == 200, resp.text
    print("Face verified successfully.")

def main():
    test_health()
    student_id = create_student()
    session_id = create_session()
    test_verify_qr(session_id)
    test_fake_qr()
    
    print("Downloading test image...")
    base64_img = download_test_image()
    test_enroll_face(student_id, base64_img)
    test_verify_face(session_id, student_id, base64_img)
    print("All basic tests passed.")

if __name__ == "__main__":
    main()
