#!/usr/bin/env python3
"""Create a resumable, district and divisional search plan for Eastern Province.

Only query text is generated here. The documented mzc CLI remains the sole
place-discovery interface; returned coordinates are checked against the
separately sourced district polygons during import review.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COVERAGE = ROOT / "data/boundaries/eastern-province-coverage.json"
PRIOR_REPORTS = (
    ROOT / "reports/batticaloa-district-expansion-phase6.json",
    ROOT / "reports/batticaloa-district-expansion-phase6-1.json",
    ROOT / "reports/batticaloa-district-expansion-phase6-2.json",
    ROOT / "reports/batticaloa-district-expansion-phase6-3.json",
)

FAMILIES = (
    ("food", "restaurants cafes bakeries tea shops street food and other food businesses"),
    ("grocery-retail", "grocery stores supermarkets cooperative shops markets and general retail"),
    ("clothing-textiles", "clothing textile footwear tailors and garment businesses"),
    ("electronics-mobile", "electronics mobile phone computer and repair shops"),
    ("hardware-construction", "hardware construction and building material suppliers"),
    ("accommodation", "hotels guest houses resorts and other public accommodation"),
    ("health", "hospitals clinics medical centres pharmacies dental and diagnostic services"),
    ("education", "schools colleges universities tuition centres libraries and public education"),
    ("finance", "banks ATMs insurance and other financial services"),
    ("government-services", "government offices public services police postal and administrative offices"),
    ("religious", "mosques temples churches kovils and other religious institutions"),
    ("transport", "bus stations railway stations ferry terminals and public transport facilities"),
    ("fuel-vehicle", "fuel stations garages vehicle repair motorcycle and vehicle services"),
    ("markets-wholesale", "markets wholesale shops and commercial establishments"),
    ("agriculture-fisheries", "agriculture fisheries seafood markets and related public businesses"),
    ("personal-services", "salons barbershops printing photography communication and personal services"),
    ("recreation-tourism", "parks beaches sports facilities tourist attractions and recreation"),
    ("community-public", "community centres public halls libraries public facilities and visitor services"),
)

# Alternate settlement spellings not guaranteed to be present in official DS
# division names. These are search prompts, never administrative assignments.
SPELLING_VARIANTS = (
    ("Batticaloa", "Batticaloa City", "Batticaloa"),
    ("Batticaloa", "Valaichenai", "Batticaloa"),
    ("Batticaloa", "Valachchenai", "Batticaloa"),
    ("Batticaloa", "Oddamawadi", "Batticaloa"),
    ("Batticaloa", "Oddamavadi", "Batticaloa"),
    ("Batticaloa", "Kokkadicholai", "Batticaloa"),
    ("Batticaloa", "Kokkadichcholai", "Batticaloa"),
    ("Batticaloa", "Kaluwanchikudi", "Batticaloa"),
    ("Batticaloa", "Kaluwanchikudy", "Batticaloa"),
    ("Batticaloa", "Eravur", "Batticaloa"),
    ("Batticaloa", "Eravoor", "Batticaloa"),
    ("Ampara", "Akkaraipattu", "Ampara"),
    ("Ampara", "Kalmunai", "Ampara"),
    ("Ampara", "Sammanthurai", "Ampara"),
    ("Ampara", "Samanthurai", "Ampara"),
    ("Ampara", "Pottuvil", "Ampara"),
    ("Ampara", "Pothuvil", "Ampara"),
    ("Ampara", "Arugam Bay", "Ampara"),
    ("Ampara", "Ninthavur", "Ampara"),
    ("Ampara", "Navanthavur", "Ampara"),
    ("Trincomalee", "Trincomalee City", "Trincomalee"),
    ("Trincomalee", "Muttur", "Trincomalee"),
    ("Trincomalee", "Muthur", "Trincomalee"),
    ("Trincomalee", "Kinniya", "Trincomalee"),
    ("Trincomalee", "Kantale", "Trincomalee"),
    ("Trincomalee", "Kantalai", "Trincomalee"),
    ("Trincomalee", "Nilaveli", "Trincomalee"),
    ("Trincomalee", "Uppuveli", "Trincomalee"),
    ("Trincomalee", "Kuchchaveli", "Trincomalee"),
    ("Trincomalee", "Verugal", "Trincomalee"),
    ("Trincomalee", "Eachchilampattu", "Trincomalee"),
)


def normalize_query(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def previous_queries(paths: tuple[Path, ...] = PRIOR_REPORTS) -> set[str]:
    found: set[str] = set()
    for path in paths:
        if not path.exists():
            continue
        report = json.loads(path.read_text(encoding="utf-8"))
        for query in report.get("discovery", {}).get("queries", []):
            value = query.get("query")
            if isinstance(value, str) and value.strip():
                found.add(normalize_query(value))
    return found


def build_plan(coverage: dict | None = None, previous: set[str] | None = None) -> list[dict]:
    coverage = coverage or json.loads(COVERAGE.read_text(encoding="utf-8"))
    previous = set(previous if previous is not None else previous_queries())
    districts = {51: "Batticaloa", 52: "Ampara", 53: "Trincomalee"}
    divisions = [row for row in coverage["divisions"] if row.get("query_target")]
    rows: list[dict] = []

    def add(district: str, area: str, category: str, phrase: str, level: str, query: str) -> None:
        normalized = normalize_query(query)
        if normalized in previous:
            return
        previous.add(normalized)
        rows.append({
            "district": district,
            "area": area,
            "category": category,
            "discovery_level": level,
            "reason": "systematic Eastern Province coverage matrix; search wording is not proof of geographic membership",
            "query": query,
            "limit": 500,
            "country": "lk",
            "timeout": 30,
        })

    for district in districts.values():
        add(district, district, "all-public", "public places",
            "district", f"public places in {district} District, Eastern Province, Sri Lanka")
        for category, phrase in FAMILIES:
            add(district, district, category, phrase, "district-category",
                f"{phrase} in {district} District, Eastern Province, Sri Lanka")

    for division in divisions:
        district = division["district_name"]
        area = division["ds_division_name"]
        add(district, area, "all-public", "public places and businesses across the division",
            "divisional-secretariat", f"public places, businesses, institutions and public facilities in {area}, {district} District, Eastern Province, Sri Lanka")

    for district, spelling, expected_district in SPELLING_VARIANTS:
        if expected_district not in districts.values():
            continue
        add(district, spelling, "all-public", "alternate or common settlement spelling check",
            "settlement-spelling", f"public places, businesses and institutions in {spelling}, {district} District, Eastern Province, Sri Lanka")

    return rows


def refine_at_limit(manifest: list[dict], coverage: dict | None = None) -> list[dict]:
    """Subdivide queries with exactly 500 results by division/category."""
    coverage = coverage or json.loads(COVERAGE.read_text(encoding="utf-8"))
    existing = {normalize_query(row.get("query", "")) for row in manifest}
    refinements: list[dict] = []
    divisions = [row for row in coverage["divisions"] if row.get("query_target")]
    for row in manifest:
        if row.get("status") != "success" or not row.get("at_limit"):
            continue
        district = row.get("district")
        category = row.get("category")
        if row.get("discovery_level") == "divisional-category":
            continue
        areas = [d for d in divisions if d["district_name"] == district]
        if row.get("discovery_level") == "divisional-secretariat" or row.get("discovery_level") == "settlement-spelling":
            areas = [{"district_name": district, "ds_division_name": row.get("area", "")}]
        families = FAMILIES if category == "all-public" else [item for item in FAMILIES if item[0] == category]
        for area in areas:
            for family, phrase in families:
                text = f"{phrase} in {area['ds_division_name']}, {district} District, Eastern Province, Sri Lanka"
                if normalize_query(text) in existing:
                    continue
                existing.add(normalize_query(text))
                refinements.append({
                    "district": district, "area": area["ds_division_name"], "category": family,
                    "discovery_level": "divisional-category",
                    "reason": f"subdivision of a query that returned the maximum 500 results ({row.get('query')})",
                    "query": text, "limit": 500, "country": "lk", "timeout": 30,
                })
    return refinements


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/mazo-eastern-province/planned-queries.json"))
    parser.add_argument("--refine-manifest", type=Path, help="write only query subdivisions for at-limit successful responses")
    args = parser.parse_args()
    if args.refine_manifest:
        manifest = json.loads(args.refine_manifest.read_text(encoding="utf-8"))
        plan = refine_at_limit(manifest)
    else:
        plan = build_plan()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "queries": len(plan), "districts": sorted({row["district"] for row in plan}),
        "areas": len({(row["district"], row["area"]) for row in plan}),
        "categories": sorted({row["category"] for row in plan}),
        "limit_per_query": 500, "country": "lk", "output": str(args.output),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
