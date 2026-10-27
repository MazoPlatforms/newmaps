"""Conservative title casing for Mazo Maps place names.

Ordinary words receive an initial capital. Known acronyms and brand forms are
preserved, while mixed-case tokens are treated as intentional stylization.
Spelling and uncased Unicode scripts are never transliterated or rewritten.
"""
from __future__ import annotations

import re

ACRONYMS = {
    "AC", "ADS", "AIDS", "AP", "ATM", "ATMS", "BC", "BOC", "BTS", "BT",
    "CBK", "CEB", "CCTV", "CDM", "DC", "DFCC", "DJ", "DS", "FM", "GPS",
    "HNB", "ICT", "IDB", "IT", "KFC", "LED", "LK", "LPG", "MCC", "MK",
    "NDB", "NGO", "NHK", "NSB", "PC", "PLC", "PVT", "RDA", "SLT", "SMR",
    "SBC", "TV", "UCTDA", "USB", "VVN",
}
BRAND_CASE = {
    "ADDAX": "ADDAX",  # IDB listing uses this established spelling.
    "DAHUA": "Dahua",
    "HIKVISION": "Hikvision",
    "KEELLS": "Keells",
}
WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)


def _case_word(word: str, all_caps_name: bool) -> str:
    # Preserve possessive suffixes as lowercase: People's, Jeweller's.
    possessive = re.fullmatch(r"(.+)(['’]s)", word, re.IGNORECASE)
    core, suffix = (possessive.group(1), possessive.group(2)) if possessive else (word, "")
    # Dotted domain suffixes (example.lk) retain their original case.
    if all_caps_name and core.upper() in ACRONYMS:
        return core.upper() + suffix.lower()
    if core.upper() in BRAND_CASE:
        return BRAND_CASE[core.upper()] + suffix.lower()
    letters = [c for c in core if c.lower() != c.upper()]
    if not letters:
        return word
    if not all_caps_name and len(letters) > 1:
        is_ordinary_case = (
            all(c.islower() for c in letters)
            or all(c.isupper() for c in letters)
            or (letters[0].isupper() and all(c.islower() for c in letters[1:]))
        )
        if not is_ordinary_case:
            return word
    if not all_caps_name and all(c.isupper() for c in letters):
        # An acronym or intentional all-caps brand inside a mixed-case name.
        return word
    parts = re.split(r"(['’])", core)
    result = []
    for part in parts:
        if part in {"'", "’"}:
            result.append(part)
        elif part:
            if part.upper() in ACRONYMS:
                result.append(part.upper())
            elif part.upper() in BRAND_CASE:
                result.append(BRAND_CASE[part.upper()])
            else:
                first = part[0].upper()
                # Avoid Unicode case mappings that expand one character.
                result.append(first + part[1:].lower() if len(first) == 1 else part)
    return "".join(result) + suffix.lower()


def normalize_place_name(value: str) -> str:
    """Capitalize each ordinary word without changing spelling or stylization."""
    compact = re.sub(r"\s+", " ", str(value)).strip()
    if not compact:
        return compact
    letters = [c for c in compact if c.lower() != c.upper()]
    all_caps_name = bool(letters) and all(c.isupper() for c in letters)
    def replace(match: re.Match[str]) -> str:
        # Preserve short lowercase web suffixes rather than turning .lk into .LK.
        if match.start() and compact[match.start() - 1] == "." and match.group(0).islower():
            return match.group(0)
        return _case_word(match.group(0), all_caps_name)

    return WORD.sub(replace, compact)
