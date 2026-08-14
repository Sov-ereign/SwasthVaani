import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import asyncio
from server import find_recommended_providers, check_red_flags

async def run_tests():
    print("=================================================")
    print("SWASTHVAANI GEO-MATCHING & PROVIDER ENGINE TESTS")
    print("=================================================")

    # Test 1: Guardrail verification - check_red_flags intact
    print("\n1. Testing check_red_flags guardrail...")
    rf_flags = check_red_flags("I have severe chest pain and cannot breathe")
    assert len(rf_flags) > 0, "Red flag detection should identify chest pain"
    print(f"   [OK] Red flag gate intact: detected flags = {rf_flags}")

    # Test 2: Recommended providers with PIN 221005 (Varanasi)
    print("\n2. Testing find_recommended_providers('Cardiologist', '221005')...")
    providers = await find_recommended_providers("Cardiologist", "221005")
    assert len(providers) > 0, "Provider list should never be empty"
    print(f"   [OK] Returned {len(providers)} total matching providers/facilities.")

    # Test 3: Verify Registered vs OSM facility separation
    reg_providers = [p for p in providers if p.get("is_registered", True) is not False]
    osm_providers = [p for p in providers if p.get("is_registered") is False]

    print(f"   [OK] Registered Providers (Primary): {len(reg_providers)}")
    for rp in reg_providers[:2]:
        print(f"      - {rp['name']} | Role: {rp.get('role')} | Can Request: {rp.get('can_receive_requests')}")
        assert rp.get("can_receive_requests") is True, "Registered provider must allow requests"

    print(f"   [OK] OSM Real-time Facilities (Supplementary): {len(osm_providers)}")
    for op in osm_providers[:3]:
        print(f"      - {op['name']} | Type: {op.get('facility_type')} | Dist: {op.get('distance_km')}km | Can Request: {op.get('can_receive_requests')}")
        assert op.get("can_receive_requests") is False, "OSM facility must NOT allow direct requests"
        assert "OpenStreetMap" in op.get("attribution", ""), "OSM facility must include ODbL attribution"

    # Test 4: Verify Registered providers rank FIRST
    if reg_providers and osm_providers:
        assert providers[0].get("is_registered") is not False, "Registered provider must rank first"
        print("   [OK] Ordering verified: Registered providers rank on top before OSM facilities")

    # Test 5: Fallback resilience test with unknown/empty PIN
    print("\n3. Testing resilient fallback with no PIN...")
    fallback_provs = await find_recommended_providers("General Physician", None)
    assert len(fallback_provs) > 0, "Fallback must return seed providers"
    print(f"   [OK] Fallback returned {len(fallback_provs)} providers — stage demo will never fail with empty list")

    print("\n=================================================")
    print("ALL GEO-MATCHING & PROVIDER ENGINE TESTS PASSED!")
    print("=================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
