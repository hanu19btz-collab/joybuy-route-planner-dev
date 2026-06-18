from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import json
import pandas as pd
import requests
import io

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
