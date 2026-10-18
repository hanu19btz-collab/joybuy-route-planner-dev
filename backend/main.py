from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import pandas as pd
import requests
import io
import os
import re
import time

SUPABASE_URL     = "https://ixmoqsfoilnpmlpgstxm.supabase.co"
SUPABASE_ANON    = "sb_publishable_MA_zm77TgThlb0awcaGIUg_Pm5bFw4w"
SUPABASE_SERVICE = os.environ.get("SUPABASE_SERVICE_KEY", "")

# =====================================
# LOAD CONFIG — single source of truth
# =====================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(BASE_DIR, "data", "depots.json"), "r", encoding="utf-8") as f:
    _config = json.load(f)

DEPOTS       = _config["depots"]
ROUTE_COLORS = _config["colors"]

# =====================================
# APP
# =====================================

app = FastAPI()

# ALLOWED_ORIGINS (optional, comma separated) restricts which sites may call
# this API, e.g. "https://joybuy-route-planner-dev-sp8i.vercel.app".
# If it is not set, every origin is allowed (previous behaviour).
_origins_env = os.environ.get("ALLOWED_ORIGINS", "*").strip()
ALLOWED_ORIGINS = (
    ["*"] if _origins_env in ("", "*")
    else [o.strip() for o in _origins_env.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

POSTCODE_API = "https://api.postcodes.io/postcodes/"

HTTP_TIMEOUT = 15      # seconds, Supabase / postcodes.io
ORS_TIMEOUT  = 25      # seconds, OpenRouteService


# =====================================
# AUTH HELPERS
# =====================================

def _service_headers():
    return {
        "apikey": SUPABASE_SERVICE,
        "Authorization": f"Bearer {SUPABASE_SERVICE}",
        "Content-Type": "application/json",
    }


# token -> (user_id, valid_until). Avoids calling Supabase on every request
# (the map can fire many /route-geometry calls in a row).
_user_cache = {}
USER_CACHE_SECONDS = 60


def _verify_user(authorization):
    """Returns the Supabase user id for a valid login token, else None."""
    if not authorization:
        return None

    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return None

    now = time.time()
    cached = _user_cache.get(token)
    if cached and cached[1] > now:
        return cached[0]

    try:
        r = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON, "Authorization": f"Bearer {token}"},
            timeout=HTTP_TIMEOUT,
        )
    except requests.RequestException:
        return None

    if r.status_code != 200:
        return None

    user_id = r.json().get("id")
    if not user_id:
        return None

    if len(_user_cache) > 1000:
        _user_cache.clear()
    _user_cache[token] = (user_id, now + USER_CACHE_SECONDS)

    return user_id


def _require_user(authorization):
    if not _verify_user(authorization):
        raise HTTPException(401, "Login required")


def _verify_admin(authorization):
    user_id = _verify_user(authorization)
    if not user_id:
        return None

    try:
        r2 = requests.get(
            f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}&select=role",
            headers=_service_headers(),
            timeout=HTTP_TIMEOUT,
        )
    except requests.RequestException:
        return None

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
        headers=_service_headers(),
        timeout=HTTP_TIMEOUT,
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
        headers=_service_headers(),
        timeout=HTTP_TIMEOUT,
    )
    data = r.json()
    if r.status_code >= 400:
        raise HTTPException(400, data.get("msg", "Error creating user"))
    user_id = data.get("id")
    if user_id:
        p = requests.patch(
            f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}",
            json={"depot_id": body["depot_id"], "role": body["role"]},
            headers={**_service_headers(), "Prefer": "return=minimal"},
            timeout=HTTP_TIMEOUT,
        )
        if p.status_code >= 400:
            raise HTTPException(
                500, "User created, but saving the depot/role in profiles failed"
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
    r = requests.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        json=payload,
        headers=_service_headers(),
        timeout=HTTP_TIMEOUT,
    )
    if r.status_code >= 400:
        raise HTTPException(400, "Error updating user")
    p = requests.patch(
        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}",
        json={"depot_id": body["depot_id"], "role": body["role"]},
        headers={**_service_headers(), "Prefer": "return=minimal"},
        timeout=HTTP_TIMEOUT,
    )
    if p.status_code >= 400:
        raise HTTPException(
            500, "User updated, but saving the depot/role in profiles failed"
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
        headers=_service_headers(),
        timeout=HTTP_TIMEOUT,
    )
    return {"success": r.status_code == 200}


# =====================================
# ROUTE DETECTION
# =====================================

def get_route(postcode: str, depot_routes: dict) -> str:

    postcode = postcode.upper().strip()
    district = postcode.split(" ")[0]
    district = ''.join(c for c in district if c.isalnum())

    # Postcode written without a space ("LE40JU"): the last 3 characters
    # are always the inward code, so what is left is the district.
    if " " not in postcode and len(district) >= 5:
        district = district[:-3]

    for route_name, prefixes in depot_routes.items():
        # Longest prefix first so e.g. "MK43" matches before "MK4"
        for prefix in sorted(prefixes, key=len, reverse=True):
            if district == prefix:
                return route_name

    return "Unassigned"


_FULL_POSTCODE = re.compile(r"^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$")


def normalize_postcode(raw) -> str:
    """'le40ju' -> 'LE4 0JU'. Anything that is not a full postcode is kept as is."""
    value = " ".join(str(raw).upper().split())
    m = _FULL_POSTCODE.match(value)
    return f"{m.group(1)} {m.group(2)}" if m else value


# =====================================
# GEOCODING (postcodes.io)
# =====================================

def _compact(postcode: str) -> str:
    return postcode.replace(" ", "").upper()


def geocode_postcodes(postcodes):
    """
    Looks up every postcode ONCE (bulk request, 100 at a time).
    Returns {compact_postcode: (lat, lng)} for the postcodes that were found.
    Postcodes the service does not know are simply absent from the result.
    """
    found = {}
    unique = list(dict.fromkeys(postcodes))
    bulk_url = POSTCODE_API.rstrip("/")

    for i in range(0, len(unique), 100):
        chunk = unique[i:i + 100]
        bulk_ok = False

        try:
            r = requests.post(
                bulk_url,
                json={"postcodes": [_compact(p) for p in chunk]},
                timeout=HTTP_TIMEOUT,
            )
            if r.status_code == 200:
                bulk_ok = True
                for item in r.json().get("result") or []:
                    res = item.get("result")
                    if (
                        res
                        and res.get("latitude") is not None
                        and res.get("longitude") is not None
                    ):
                        found[_compact(item.get("query", ""))] = (
                            res["latitude"], res["longitude"]
                        )
        except Exception as e:
            print(e)

        if bulk_ok:
            continue

        # The bulk request itself failed: fall back to one request per postcode
        for p in chunk:
            try:
                r = requests.get(
                    f"{POSTCODE_API}{_compact(p)}", timeout=HTTP_TIMEOUT
                )
                if r.status_code != 200:
                    continue
                data = r.json()
                if data.get("status") != 200:
                    continue
                res = data["result"]
                found[_compact(p)] = (res["latitude"], res["longitude"])
            except Exception as e:
                print(e)

    return found


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

POSTCODE_COLUMNS = [
    "Postcode", "postcode", "POSTCODE",
    "Post Code", "POST CODE", "Postal Code", "Address",
]

JDW_COLUMNS = [
    "JDW", "JDW Number", "JDW_Number",
    "Tracking Number", "Tracking", "jdw",
]


@app.post("/upload")
async def upload_excel(
    depot: str,
    file: UploadFile = File(...),
    authorization: str = Header(None),
):
    _require_user(authorization)

    depot_data = DEPOTS.get(depot)

    if not depot_data:
        raise HTTPException(400, "Invalid depot")

    content = await file.read()

    try:
        excel_file = pd.ExcelFile(io.BytesIO(content))
        all_dfs = [
            pd.read_excel(excel_file, sheet_name=sheet)
            for sheet in excel_file.sheet_names
        ]
        df = pd.concat(all_dfs, ignore_index=True)
    except Exception as e:
        print(e)
        raise HTTPException(400, "Could not read the Excel file")

    # --- 1. read every row, group parcels by postcode ---
    grouped = {}

    for _, row in df.iterrows():

        postcode = None
        for col in POSTCODE_COLUMNS:
            if col in df.columns:
                value = row.get(col)
                if pd.notna(value):
                    postcode = normalize_postcode(value)
                    break

        if not postcode or postcode == "NAN":
            continue

        jdw_number = ""
        for col in JDW_COLUMNS:
            if col in df.columns:
                value = row.get(col)
                if pd.notna(value):
                    jdw_number = str(value).strip()
                    break

        if postcode not in grouped:
            grouped[postcode] = {"parcels": 0, "jdwNumbers": []}

        grouped[postcode]["parcels"] += 1

        if jdw_number:
            grouped[postcode]["jdwNumbers"].append(jdw_number)

    # --- 2. geocode each unique postcode once ---
    coords = geocode_postcodes(grouped.keys())

    # --- 3. build the result; postcodes that could not be geocoded are
    #        KEPT (lat/lng = None, geocoded = False) so they are not lost ---
    results = []

    for postcode, info in grouped.items():

        route = get_route(postcode, depot_data["routes"])
        latlng = coords.get(_compact(postcode))

        results.append({
            "name":       postcode,
            "postcode":   postcode,
            "lat":        latlng[0] if latlng else None,
            "lng":        latlng[1] if latlng else None,
            "route":      route,
            "parcels":    info["parcels"],
            "jdwNumbers": info["jdwNumbers"],
            "color":      ROUTE_COLORS.get(route, "gray"),
            "geocoded":   latlng is not None,
        })

    return results


# =====================================
# ORS PROXY (avoid CORS from browser)
# =====================================

ORS_API_KEY = os.environ.get("ORS_API_KEY", "")


def get_ors_key(depot_id):
    """Cheie ORS proprie depozitului (ORS_API_KEY_<COD>), altfel cheia principală."""
    if depot_id and str(depot_id) in DEPOTS:
        key = os.environ.get(f"ORS_API_KEY_{str(depot_id).upper()}", "")
        if key:
            return key
    return ORS_API_KEY


# Same request twice -> answer from memory, no ORS quota used.
_ors_cache = {}
ORS_CACHE_MAX = 300


def _ors_post(url, payload, api_key):
    cache_key = url + json.dumps(payload, sort_keys=True)

    if cache_key in _ors_cache:
        return _ors_cache[cache_key]

    try:
        r = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json",
            },
            timeout=ORS_TIMEOUT,
        )
    except requests.RequestException as e:
        raise HTTPException(504, f"ORS unreachable: {e}")

    if r.status_code != 200:
        raise HTTPException(r.status_code, f"ORS error: {r.text}")

    data = r.json()

    if len(_ors_cache) >= ORS_CACHE_MAX:
        _ors_cache.clear()
    _ors_cache[cache_key] = data

    return data


@app.post("/route-geometry")
def route_geometry(body: dict, authorization: str = Header(None)):
    _require_user(authorization)

    api_key = get_ors_key(body.get("depot"))
    if not api_key:
        raise HTTPException(500, "ORS_API_KEY not configured on server")

    coordinates = body.get("coordinates")
    if not coordinates or len(coordinates) < 2:
        raise HTTPException(400, "Need at least 2 coordinates")

    return _ors_post(
        "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
        {
            "coordinates": coordinates,
            "instructions": False,
            "preference": "recommended",
        },
        api_key,
    )


@app.post("/route-matrix")
def route_matrix(body: dict, authorization: str = Header(None)):
    _require_user(authorization)

    api_key = get_ors_key(body.get("depot"))
    if not api_key:
        raise HTTPException(500, "ORS_API_KEY not configured on server")

    locations = body.get("locations")
    if not locations or len(locations) < 2:
        raise HTTPException(400, "Need at least 2 locations")

    return _ors_post(
        "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
        {
            "locations": locations,
            "metrics": ["distance"],
        },
        api_key,
    )
