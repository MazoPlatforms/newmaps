"""Conservative public-map eligibility checks for place records.

This classifier is a privacy gate, not a truth detector. It only confirms a
private residence when the record explicitly says so in its category. Ambiguous
residential or context-free records are withheld pending human review.
"""
from __future__ import annotations

import re
import unicodedata

PRIVATE_CATEGORIES = {"private residence", "private home", "private household"}
RESIDENTIAL_ONLY_CATEGORIES = {
    "apartment building", "housing complex", "housing society", "residential area",
    "residential building", "villa", "private residence", "private home",
    "private household", "household",
}
GENERIC_CATEGORIES = {"establishment", "point of interest", "point_of_interest", "premise"}
PUBLIC_CATEGORY = re.compile(
    r"\b(store|shop|market|restaurant|cafe|bakery|hotel|guest house|homestay|"
    r"school|college|university|institute|academy|mosque|masjid|temple|church|"
    r"bank|hospital|clinic|pharmacy|office|library|museum|park|stadium|farm|"
    r"salon|repair|service|company|factory|industry|transport|taxi|station|"
    r"tourism|resort|catering|agency|studio|workshop|center|centre|hall|"
    r"community|council|association|organization|organisation|mall|supermarket|"
    r"fuel|gas|atm|landmark|public|care home|orphanage|shelter|foundation|"
    r"government|municipal|attraction|monument|bridge|port|airport|playground|"
    r"garden|venue|lodging|lodge|hostel|charity|religious institution|"
    r"educational institution|financial institution|medical center|water treatment|"
    r"tailor|designer|professional|practitioner|electrician|plumber|mechanic|"
    r"photographer|artist|manufacturer|wholesaler|supplier|dealer|producer|"
    r"exporter|consultant|accountant|engineer|optician|jeweler|jewellery|"
    r"jewelry|bus stop|bus depot|telephone exchange|shrine|gym|aquarium|"
    r"sports complex|sports club|sports field|sports ground|court|beach|"
    r"nursery|cemetery|place of worship|religious destination|swimming pool|"
    r"theater|theatre|bar|night club|motel|lodging|holiday home|holiday apartment|"
    r"road safety|bird watching|parking lot|warehouse|power plant|substation|"
    r"payment terminal|telecommunications|agricultural production|agricultural cooperative|"
    r"garbage dump|faculty|kindergarten|preschool|bus|chamber|security system|"
    r"car wash|vehicle|motorcycle|computer support|beauty product|food court|"
    r"dessert buffet|footwear|clothing|fabric|auto|telecom|telecommunication|"
    r"food product|building material|appliance|electronic|solar photovoltaic|"
    r"seafood|fertilizer|seed|accommodation|sauna|badminton|soccer|cricket|"
    r"boxing|board game|movie|swimming|garment|human resource|fabric|"
    r"financial|religious|agricultural|public health|state police|computer|"
    r"motor vehicle|tractor|buick|automobile|service establishment|house of worship|"
    r"tower|laboratory|\blab|doctor|grocer|dressmaker|homeopath|accounting firm|"
    r"breeder|computers)\b",
    re.I,
)
RESIDENTIAL_MARKER = re.compile(r"\b(home|house|residence|residential|dwelling|apartment|villa)\b", re.I)
RESIDENTIAL_ADDRESS_MARKER = re.compile(
    r"\b(private residence|private property|residential area|housing scheme|housing society|apartment complex)\b", re.I)
PERSONAL_HOME = re.compile(
    r"(?:\bmy\b|\bour\b|\bfamily\b|\bprivate\b|\bpersonal\b|\b[\wÀ-ž.'’ -]+['’]s)\s+"
    r"(?:family\s+)?(?:home|house|residence)\b", re.I | re.UNICODE,
)
PUBLIC_CONTEXT = re.compile(
    r"\b(shop|store|market|restaurant|cafe|bakery|hotel|guest house|homestay|"
    r"holiday home|school|college|university|institute|academy|mosque|masjid|temple|"
    r"church|bank|hospital|clinic|pharmacy|office|library|museum|park|stadium|farm|"
    r"salon|repair|service|company|factory|industry|transport|taxi|bus station|tourism|"
    r"resort|catering|agency|studio|workshop|center|centre|hall|community|council|"
    r"association|organization|organisation|mall|supermarket|fuel|gas station|atm|"
    r"landmark|public|care home|orphanage|shelter|foundation|government|municipal)\b",
    re.I,
)


def classify_place(record: dict) -> dict:
    """Return status, reason codes, and a short rationale without changing data."""
    name = unicodedata.normalize("NFC", str(record.get("name") or "")).strip()
    categories = [unicodedata.normalize("NFC", str(c)).strip() for c in (record.get("categories") or []) if str(c).strip()]
    address = unicodedata.normalize("NFC", str(record.get("address") or "")).strip()
    normalized_categories = {re.sub(r"\s+", " ", c.casefold()) for c in categories}
    non_generic = normalized_categories - GENERIC_CATEGORIES
    private_category = bool(normalized_categories & PRIVATE_CATEGORIES)
    residential_only = bool(non_generic) and non_generic <= RESIDENTIAL_ONLY_CATEGORIES
    public_category = any(PUBLIC_CATEGORY.search(category) for category in non_generic)
    residential_marker = bool(RESIDENTIAL_MARKER.search(name) or any(RESIDENTIAL_MARKER.search(c) for c in categories)
                             or RESIDENTIAL_ADDRESS_MARKER.search(address))
    public_name = bool(PUBLIC_CONTEXT.search(name))
    strong_private_name = bool(PERSONAL_HOME.search(name))
    school_registry_evidence = bool(record.get("school_census_no") or
                                    "ministry of education" in str(record.get("name_source") or "").casefold())

    # Positive commercial/institutional categories are enough to retain a
    # legitimate home-based business or public care/facility listing.
    if school_registry_evidence:
        return {"classification": "public_business_institutional", "eligible_for_public_map": True,
                "reason_codes": ["official_school_registry_reference"],
                "explanation": "An official school census reference is present; the record is a public institution."}
    if public_category and not residential_only:
        return {"classification": "public_business_institutional", "eligible_for_public_map": True,
                "reason_codes": ["public_place_category"],
                "explanation": "A non-generic public-place, business, or institutional category is present; personal-name wording alone does not override it."}
    if public_name and not private_category:
        return {"classification": "public_business_institutional", "eligible_for_public_map": True,
                "reason_codes": ["public_context_in_name"],
                "explanation": "The name explicitly identifies a public-facing business, institution, or facility; no private-residence category is present."}
    if private_category and strong_private_name and not public_name:
        return {"classification": "confirmed_private_residential", "eligible_for_public_map": False,
                "reason_codes": ["explicit_private_residential_category", "personal_residence_name"],
                "explanation": "The record explicitly labels a private residence and uses personal-residence wording."}
    if residential_only or (residential_marker and not public_name) or not public_category:
        reasons = []
        if residential_only or residential_marker:
            reasons.append("residential_context_without_public_place_evidence")
        if not public_category and not public_name:
            reasons.append("missing_specific_public_place_category_or_context")
        return {"classification": "uncertain", "eligible_for_public_map": False,
                "reason_codes": reasons or ["eligibility_requires_review"],
                "explanation": "Available fields do not establish a public destination; this is not a finding that the place is private or invalid."}
    return {"classification": "public_business_institutional", "eligible_for_public_map": True,
            "reason_codes": ["public_place_category"],
            "explanation": "A specific non-residential place category is present."}


def redact_location(record: dict, classification: str, review_token: str) -> dict:
    """Return a minimal public-safe placeholder, preserving only the ULID."""
    if classification not in {"confirmed_private_residential", "uncertain"}:
        raise ValueError("Only non-public records may be redacted")
    return {
        "id": record["id"],
        "name": "Location withheld pending eligibility review",
        "coordinates": None,
        "public_eligibility": classification,
        "eligibility_review_token": review_token,
    }
