#!/usr/bin/env python3
"""Plan Phase 6.2 mzc searches around measured Phase 6/6.1 coverage gaps.

This script only produces documented query strings. It does not invoke mzc,
inspect its implementation, or infer district eligibility from query wording.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = (
    ROOT / "reports/batticaloa-district-expansion-phase6.json",
    ROOT / "reports/batticaloa-district-expansion-phase6-1.json",
)

# These localities had at most 25 Phase 6/6.1 mzc records within a 2 km
# proximity window around the repository's locality anchor, or were explicit
# district settlements without a locality anchor. Proximity is a discovery
# priority proxy, not an administrative membership rule.
LOW_COVERAGE_TOWNS = (
    "Illipaiyadichchenai", "Nuwaragalathenna", "Kiran", "Vakarai",
    "Vahaneri", "Rideethenna", "Tumpalancholai", "Unnichchai",
    "Mangalagama", "Karadiyanaru", "Paddippalai", "Cheddipalaiyam",
    "Vellavely", "Kokkadichcholai",
)

RURAL_FAMILIES = (
    ("food-local", "tea shops village eateries bakeries rice mills and local food outlets"),
    ("retail-cooperative", "cooperative shops village grocery stores and local retailers"),
    ("textile-mobile", "tailors textile shops footwear and mobile phone businesses"),
    ("health-specialty", "dispensaries dental clinics diagnostic laboratories and veterinary clinics"),
    ("education-local", "preschools tuition centers vocational schools and public libraries"),
    ("public-services", "Grama Niladhari offices divisional public services police and postal facilities"),
    ("rural-transport", "bus terminals ferry services railway stops and public transport facilities"),
    ("agriculture-fisheries", "fish markets fishing supplies agricultural cooperatives animal feed and cold storage"),
    ("vehicle-services", "fuel stations vehicle repair shops and motorcycle services"),
    ("community-recreation", "community halls sports grounds parks beaches and public visitor attractions"),
)

ALTERNATE_SPELLINGS = (
    ("Vakarai", "Vaakarai"),
    ("Kiran", "Kiraan"),
    ("Vellavely", "Vellaveli"),
    ("Kokkadichcholai", "Kokkadicholai"),
    ("Chenkaladi", "Chenkalady"),
    ("Valaichchenai", "Valaichenai"),
    ("Oddamavadi", "Oddamawadi"),
    ("Kaluwanchikudy", "Kaluwanchikudi"),
    ("Eravur", "Eravoor"),
    ("Batticaloa", "Batticaloa City"),
)
ALTERNATE_FAMILIES = (
    ("food-local", "restaurants cafes bakeries tea shops and food businesses"),
    ("retail-local", "grocery stores supermarkets markets and local retail shops"),
    ("health-public", "hospitals clinics pharmacies and public health facilities"),
)

# Names surfaced by earlier mzc administrative-area responses and saved in the
# Phase 6/6.1 query log. Query labels are search terms only; returned points
# still have to pass the checked-in district polygon.
ADMINISTRATIVE_AREAS = (
    "Manmunai North", "Manmunai Pattu Araiyampathy", "Manmunai West Vavunathivu",
    "Eravur Town", "Eravur Pattu Chenkalady", "Koralai Pattu", "Porativu Pattu",
)


def normalize_query(query: str) -> str:
    return re.sub(r"\s+", " ", query).strip().casefold()


def previous_queries(report_paths: tuple[Path, ...] = REPORTS) -> set[str]:
    found: set[str] = set()
    for path in report_paths:
        report = json.loads(path.read_text(encoding="utf-8"))
        for entry in report.get("discovery", {}).get("queries", []):
            query = entry.get("query")
            if isinstance(query, str) and query.strip():
                found.add(normalize_query(query))
    return found


def build_plan(previous: set[str]) -> list[dict]:
    proposed: list[dict] = []
    for town in LOW_COVERAGE_TOWNS:
        for family, phrase in RURAL_FAMILIES:
            proposed.append({
                "town": town, "category": family,
                "reason": "low/absent locality-anchor density; use alternative rural-service wording",
                "query": f"{phrase} in {town}, Batticaloa District, Sri Lanka",
            })
    for canonical, alternate in ALTERNATE_SPELLINGS:
        for family, phrase in ALTERNATE_FAMILIES:
            proposed.append({
                "town": alternate, "category": family,
                "reason": f"alternate spelling for {canonical}; targeted query variant",
                "query": f"{phrase} in {alternate}, Batticaloa District, Sri Lanka",
            })
    for area in ADMINISTRATIVE_AREAS:
        proposed.append({
            "town": area, "category": "administrative-facilities",
            "reason": "administrative area surfaced by prior mzc output; public facility coverage check",
            "query": f"public offices schools clinics and community facilities in {area}, Batticaloa District, Sri Lanka",
        })

    result = []
    seen = set(previous)
    for entry in proposed:
        key = normalize_query(entry["query"])
        if key in seen:
            continue
        seen.add(key)
        result.append({**entry, "limit": 500, "country": "lk", "timeout": 30})
    return result


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/mazo-phase6-2-mzc/planned-queries.json"))
    args = parser.parse_args()
    plan = build_plan(previous_queries())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"new_unique_queries": len(plan), "towns": len({q["town"] for q in plan}),
                      "families": len({q["category"] for q in plan}),
                      "country": "lk", "limit_per_query": 500,
                      "output": str(args.output)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
