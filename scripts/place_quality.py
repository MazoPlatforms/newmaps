"""Semantic quality gates for the public place map and search catalogue.

Canonical records can also describe settlements and road reference markers.
They remain useful geographic data but must not be rendered as businesses.
"""
import re


SETTLEMENT_CATEGORIES = {
    "village name", "town name", "city name", "place name", "estate name",
    "settlement", "village", "town", "city",
}
ROAD_REFERENCE_CATEGORIES = {"kilometer post", "kilometre post", "milepost"}
PLACEHOLDER_NAMES = {"none", "null", "undefined", "unknown", "n/a", "na", "unnamed", "not available"}
NUMERIC_NAME = re.compile(r"^[\d\s.,:/#()+\-]+$", re.UNICODE)
PUNCTUATION_NAME = re.compile(r"^[.\-–—_]+$")


def semantic_type(record):
    categories = {str(value).strip().casefold() for value in record.get("categories", [])}
    if categories & ROAD_REFERENCE_CATEGORIES:
        return "road_reference"
    if categories & SETTLEMENT_CATEGORIES:
        return "settlement"
    name = str(record.get("name") or "").strip()
    if name.casefold() in PLACEHOLDER_NAMES or PUNCTUATION_NAME.fullmatch(name):
        return "invalid_name"
    # Plain numeric labels are valid only when the record has independent
    # business identity (address/contact/site) or is explicitly a settlement.
    if NUMERIC_NAME.fullmatch(name) and not any(record.get(key) for key in ("address", "phone", "website")):
        return "invalid_name"
    return "poi"


def is_map_poi(record):
    return semantic_type(record) == "poi"
