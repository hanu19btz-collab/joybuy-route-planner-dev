from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import pandas as pd
import requests
import io
import os

SUPABASE_URL     = "https://ixmoqsfoilnpmlpgstxm.supabase.co"
SUPABASE_ANON    = "sb_publishable_MA_zm77TgThlb0awcaGIUg_Pm5bFw4w"
SUPABASE_SERVICE = os.environ.get("SUPABASE_SERVICE_KEY", "")

# =====================================
# LOAD CONFIG — single source of truth
# =====================================

with open("data/depots.json", "r", encoding="utf-8") as f:
    _config = json.load(f)

DEPOTS       = _config["depots"]
ROUTE_COLORS = _config["colors"]

# =====================================
# APP
# =====================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POSTCODE_API = "https://api.postcodes.io/postcodes/"


# =====================================
# ADMIN HELPERS
# =====================================

def _service_headers():
    return {
        "apikey": SUPABASE_SERVICE,
        "Authorization": f"Bearer {SUPABASE_SERVICE}",
        "Content-Type": "application/json",
    }

def _verify_admin(authorization: str):
    token = authorization.replace("Bearer ", "").strip()
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {token}"}
    )
    if r.status_code != 200:
        return None
    user_id = r.json().get("id")
    if not user_id:
        return None
    r2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}&select=role",
        headers=_service_headers()
    )
    profiles = r2.json() if r2.status_code == 200 else []
    if not profiles or profiles[0].get("role") != "admin":
        return None
    return user_id


# =====================================
# ADMIN — LIST USERS
# =====================================

@app.get("/admin/users")
def list_users(authorization: str = Header(...)):
    if not _verify_admin(authorization):
        raise HTTPException(403, "Not authorized")
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/admin/users?per_page=100",
        headers=_service_headers()
    )
    return r.json()


# =====================================
# ADMIN — CREATE USER
# =====================================

@app.post("/admin/users")
def create_user(body: dict, authorization: str = Header(...)):
    if not _verify_admin(authorization):
        raise HTTPException(403, "Not authorized")
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        json={
            "email": body["email"],
            "password": body["password"],
            "email_confirm": True,
            "user_metadata": {
                "depot_id": body["depot_id"],
                "role": body["role"]
            }
        },
        headers=_service_headers()
    )
    data = r.json()
    if r.status_code >= 400:
        raise HTTPException(400, data.get("msg", "Error creating user"))
    user_id = data.get("id")
    if user_id:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}",
            json={"depot_id": body["depot_id"], "role": body["role"]},
            headers={**_service_headers(), "Prefer": "return=minimal"}
        )
    return data


# =====================================
# ADMIN — UPDATE USER
# =====================================

@app.put("/admin/users/{user_id}")
def update_user(user_id: str, body: dict, authorization: str = Header(...)):
    if not _verify_admin(authorization):
        raise HTTPException(403, "Not authorized")
    payload = {"user_metadata": {"depot_id": body["depot_id"], "role": body["role"]}}
    if body.get("password"):
        payload["password"] = body["password"]
    requests.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        json=payload,
        headers=_service_headers()
    )
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}",
        json={"depot_id": body["depot_id"], "role": body["role"]},
        headers={**_service_headers(), "Prefer": "return=minimal"}
    )
    return {"success": True}


# =====================================
# ADMIN — DELETE USER
# =====================================

@app.delete("/admin/users/{user_id}")
def delete_user(user_id: str, authorization: str = Header(...)):
    if not _verify_admin(authorization):
        raise HTTPException(403, "Not authorized")
    r = requests.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=_service_headers()
    )
    return {"success": r.status_code == 200}


# =====================================
# ROUTE DETECTION
# =====================================

def get_route(postcode: str, depot_routes: dict) -> str:

    postcode = postcode.upper().strip()
    district = postcode.split(" ")[0]
    district = ''.join(c for c in district if c.isalnum())

    for route_name, prefixes in depot_routes.items():
        # Longest prefix first so e.g. "MK43" matches before "MK4"
        for prefix in sorted(prefixes, key=len, reverse=True):
            if district == prefix:
                return route_name

    return "Unassigned"


# =====================================
# ROOT
# =====================================

@app.get("/")
def root():
    return {"status": "online"}


# =====================================
# DEPOTS LIST
# =====================================

@app.get("/depots")
def get_depots():
    return [
        {
            "id":       depot_id,
            "name":     depot["name"],
            "postcode": depot.get("postcode", ""),
            "lat":      depot["lat"],
            "lng":      depot["lng"],
        }
        for depot_id, depot in DEPOTS.items()
    ]


# =====================================
# UPLOAD
# =====================================

@app.post("/upload")
async def upload_excel(
    depot: str,
    file: UploadFile = File(...)
):
    depot_data = DEPOTS.get(depot)

    if not depot_data:
        return {"error": "Invalid depot"}

    content = await file.read()
    excel_file = pd.ExcelFile(io.BytesIO(content))

    all_dfs = [
        pd.read_excel(excel_file, sheet_name=sheet)
        for sheet in excel_file.sheet_names
    ]
    df = pd.concat(all_dfs, ignore_index=True)

    grouped_locations = {}

    POSTCODE_COLUMNS = [
        "Postcode", "postcode", "POSTCODE",
        "Post Code", "POST CODE", "Postal Code", "Address",
    ]

    JDW_COLUMNS = [
        "JDW", "JDW Number", "JDW_Number",
        "Tracking Number", "Tracking", "jdw",
    ]

    for _, row in df.iterrows():

        # --- find postcode ---
        postcode = None
        for col in POSTCODE_COLUMNS:
            if col in df.columns:
                value = row.get(col)
                if pd.notna(value):
                    postcode = str(value).upper().strip()
                    break

        if not postcode or postcode == "NAN":
            continue

        route = get_route(postcode, depot_data["routes"])

        # --- find JDW number ---
        jdw_number = ""
        for col in JDW_COLUMNS:
            if col in df.columns:
                value = row.get(col)
                if pd.notna(value):
                    jdw_number = str(value).strip()
                    break

        # --- geocode ---
        try:
            clean_postcode = postcode.replace(" ", "")
            response = requests.get(f"{POSTCODE_API}{clean_postcode}")

            if response.status_code != 200:
                continue

            data = response.json()

            if data["status"] != 200:
                continue

            result = data["result"]

            if postcode not in grouped_locations:
                grouped_locations[postcode] = {
                    "name":       postcode,
                    "postcode":   postcode,
                    "lat":        result["latitude"],
                    "lng":        result["longitude"],
                    "route":      route,
                    "parcels":    0,
                    "jdwNumbers": [],
                    "color":      ROUTE_COLORS.get(route, "gray"),
                }

            grouped_locations[postcode]["parcels"] += 1

            if jdw_number:
                grouped_locations[postcode]["jdwNumbers"].append(jdw_number)

        except Exception as e:
            print(e)

    return list(grouped_locations.values())
    
# =====================================
# ORS PROXY (avoid CORS from browser)
# =====================================

ORS_API_KEY = os.environ.get("ORS_API_KEY", "")


@app.post("/route-geometry")
def route_geometry(body: dict):
    if not ORS_API_KEY:
        raise HTTPException(500, "ORS_API_KEY not configured on server")

    coordinates = body.get("coordinates")
    if not coordinates or len(coordinates) < 2:
        raise HTTPException(400, "Need at least 2 coordinates")

    r = requests.post(
        "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
        json={
            "coordinates": coordinates,
            "instructions": False,
            "preference": "recommended",
        },
        headers={
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json",
        },
    )

    if r.status_code != 200:
        raise HTTPException(r.status_code, f"ORS error: {r.text}")

    return r.json()


@app.post("/route-matrix")
def route_matrix(body: dict):
    if not ORS_API_KEY:
        raise HTTPException(500, "ORS_API_KEY not configured on server")

    locations = body.get("locations")
    if not locations or len(locations) < 2:
        raise HTTPException(400, "Need at least 2 locations")

    r = requests.post(
        "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
        json={
            "locations": locations,
            "metrics": ["distance"],
        },
        headers={
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json",
        },
    )

    if r.status_code != 200:
        raise HTTPException(r.status_code, f"ORS error: {r.text}")

    return r.json()
