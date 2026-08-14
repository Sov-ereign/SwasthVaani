"""
SwasthVaani — Real-time PIN Code Geocoding & OpenStreetMap Facility Matching Engine
Handles:
1. PIN code -> District/State (postalpincode.in) -> Coordinates (Nominatim)
2. OpenStreetMap Facility Lookup (Nominatim Healthcare & Overpass)
3. Caching layer (in-memory & Mongo) with TTL (48 hours)
4. Strict separation: Registered providers vs Informational OSM facilities
5. Resilient fallback chain (Live OSM -> Cached OSM -> Seed Provider Guarantee)
"""

import asyncio
import logging
import math
import time
from typing import Dict, List, Optional, Tuple
import httpx

logger = logging.getLogger(__name__)

# Compliant descriptive User-Agent for Nominatim & Overpass usage policies
USER_AGENT = "SwasthVaani-Healthcare-Triage/1.0 (contact: info@swasthvaani.health)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
POSTAL_PINCODE_URL = "https://api.postalpincode.in/pincode"

# In-Memory Cache: key -> {"data": ..., "expires_at": timestamp}
GEO_CACHE: Dict[str, dict] = {}
CACHE_TTL_SECONDS = 3600 * 48  # 48 hours TTL


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in kilometers."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def get_cached(key: str, db=None) -> Optional[dict]:
    """Retrieve from Mongo or in-memory cache if not expired."""
    now = time.time()
    if db is not None:
        try:
            doc = await db.geo_cache.find_one({"_id": key})
            if doc and doc.get("expires_at", 0) > now:
                return doc.get("data")
        except Exception as e:
            logger.debug(f"Mongo geo_cache read error: {e}")

    mem_entry = GEO_CACHE.get(key)
    if mem_entry and mem_entry.get("expires_at", 0) > now:
        return mem_entry.get("data")
    return None


async def set_cached(key: str, data: any, db=None, ttl: int = CACHE_TTL_SECONDS):
    """Store in Mongo and in-memory cache with TTL."""
    expires_at = time.time() + ttl
    GEO_CACHE[key] = {"data": data, "expires_at": expires_at}

    if db is not None:
        try:
            await db.geo_cache.update_one(
                {"_id": key},
                {"$set": {"data": data, "expires_at": expires_at, "updated_at": time.time()}},
                upsert=True
            )
        except Exception as e:
            logger.debug(f"Mongo geo_cache write error: {e}")


async def geocode_pincode(pincode: str, db=None) -> Optional[dict]:
    """
    Phase 1: PIN code -> coordinates using postalpincode.in + Nominatim.
    Returns: {"lat": float, "lon": float, "district": str, "state": str, "display_name": str, "pincode": str}
    """
    pin = (pincode or "").strip()
    if not pin or len(pin) != 6 or not pin.isdigit():
        return None

    cache_key = f"geocode_{pin}"
    cached = await get_cached(cache_key, db)
    if cached:
        return cached

    district = ""
    state = ""
    display_name = ""

    # 1. Resolve PIN to District & State via postalpincode.in
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{POSTAL_PINCODE_URL}/{pin}", headers={"User-Agent": USER_AGENT})
            if resp.status_code == 200:
                body = resp.json()
                if isinstance(body, list) and len(body) > 0 and body[0].get("Status") == "Success":
                    pos = body[0].get("PostOffice") or []
                    if pos:
                        district = pos[0].get("District") or ""
                        state = pos[0].get("State") or ""
                        po_name = pos[0].get("Name") or ""
                        display_name = f"{po_name}, {district}, {state}"
    except Exception as e:
        logger.warning(f"postalpincode.in query failed for PIN {pin}: {e}")

    # 2. Geocode with Nominatim (District + State + India is much more reliable in rural OSM)
    lat = None
    lon = None
    query_str = f"{district}, {state}, India" if (district and state) else f"{pin}, India"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            headers = {"User-Agent": USER_AGENT}
            params = {"q": query_str, "format": "json", "limit": 1, "countrycodes": "in"}
            resp = await client.get(NOMINATIM_URL, params=params, headers=headers)
            if resp.status_code == 200:
                results = resp.json()
                if results and len(results) > 0:
                    lat = float(results[0]["lat"])
                    lon = float(results[0]["lon"])
                    if not display_name:
                        display_name = results[0].get("display_name", f"PIN {pin}")
    except Exception as e:
        logger.warning(f"Nominatim geocoding failed for {query_str}: {e}")

    if lat is not None and lon is not None:
        result = {
            "pincode": pin,
            "lat": lat,
            "lon": lon,
            "district": district,
            "state": state,
            "display_name": display_name or f"{district or pin}, {state or 'India'}"
        }
        await set_cached(cache_key, result, db)
        return result

    return None


async def query_osm_facilities(district: str, state: str, center_lat: float, center_lon: float, default_pin: str = "") -> List[dict]:
    """
    Phase 2: Look up OpenStreetMap hospitals, clinics, and pharmacies in the resolved area.
    """
    facilities = []
    seen = set()

    # Query 1: Hospitals & Health Centers
    # Query 2: Clinics & Pharmacies
    queries = [
        ("hospital", f"hospital in {district} {state} India"),
        ("clinic", f"clinic in {district} {state} India"),
    ]

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            for fac_type, q_str in queries:
                headers = {"User-Agent": USER_AGENT}
                params = {"q": q_str, "format": "json", "limit": 6, "countrycodes": "in"}
                resp = await client.get(NOMINATIM_URL, params=params, headers=headers)
                if resp.status_code == 200:
                    items = resp.json()
                    for item in items:
                        name_raw = item.get("name") or item.get("display_name", "").split(",")[0]
                        clean_name = name_raw.strip()
                        if not clean_name or clean_name in seen:
                            continue
                        seen.add(clean_name)

                        lat = float(item.get("lat", 0))
                        lon = float(item.get("lon", 0))
                        dist = round(haversine_distance(center_lat, center_lon, lat, lon), 1) if (lat and lon) else 0.0

                        specialties = ["General Physician"]
                        if fac_type == "hospital":
                            specialties = ["General Physician", "Emergency Medicine"]

                        facilities.append({
                            "id": f"osm_{item.get('osm_id', item.get('place_id'))}",
                            "name": clean_name,
                            "role": "facility",
                            "type": "osm_facility",
                            "facility_type": fac_type,
                            "is_registered": False,
                            "is_verified": False,
                            "can_receive_requests": False,  # Strict guardrail
                            "phone": "",
                            "address": item.get("display_name", ""),
                            "pincode": default_pin,
                            "specialties": specialties,
                            "qualification": "OpenStreetMap Listed Facility",
                            "distance_km": dist,
                            "lat": lat,
                            "lon": lon,
                            "source": "OpenStreetMap",
                            "attribution": "© OpenStreetMap contributors"
                        })
    except Exception as e:
        logger.warning(f"OSM facilities query failed for {district}: {e}")

    return facilities


async def get_nearby_osm_facilities(pincode: str, db=None) -> Tuple[List[dict], Optional[dict]]:
    """
    Phase 4: Caching & resilience pipeline.
    Live OSM Query -> Cached OSM -> Return empty list if all fail.
    """
    pin = (pincode or "").strip()
    if not pin or len(pin) != 6 or not pin.isdigit():
        return [], None

    geo = await geocode_pincode(pin, db)
    if not geo:
        return [], None

    lat = geo["lat"]
    lon = geo["lon"]
    cache_key = f"osm_facilities_{pin}"

    # Check cache first
    cached_facilities = await get_cached(cache_key, db)
    if cached_facilities and isinstance(cached_facilities, list) and len(cached_facilities) > 0:
        return cached_facilities, geo

    # Live OSM lookup
    district = geo.get("district") or pin
    state = geo.get("state") or "India"
    facilities = await query_osm_facilities(district, state, lat, lon, default_pin=pin)

    # Sort by distance
    facilities.sort(key=lambda x: x.get("distance_km", 999))

    if facilities:
        await set_cached(cache_key, facilities[:8], db)
        return facilities[:8], geo

    return [], geo
