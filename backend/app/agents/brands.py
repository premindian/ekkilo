"""Brand extraction helpers for grocery search."""

# Longer brands first so "mother dairy" wins over partial matches
BRAND_KEYWORDS = sorted([
    "mother dairy",
    "india gate",
    "aashirvaad",
    "britannia",
    "horlicks",
    "bournvita",
    "complan",
    "kohinoor",
    "annapurna",
    "pillsbury",
    "saffola",
    "sundrop",
    "fortune",
    "nestle",
    "daawat",
    "parle",
    "maggi",
    "boost",
    "dalda",
    "tata",
    "amul",
], key=len, reverse=True)

# Common brand typos / no-space variants → canonical brand
BRAND_ALIASES = {
    "amool": "amul",
    "ammul": "amul",
    "amulll": "amul",
    "indiagate": "india gate",
    "india-gate": "india gate",
    "motherdairy": "mother dairy",
    "aashirvad": "aashirvaad",
    "ashirvad": "aashirvaad",
    "ashirvaad": "aashirvaad",
}


def normalize_text(text: str) -> str:
    return " ".join((text or "").lower().strip().split())


def extract_brand(text: str):
    """
    Extract preferred brand from a search phrase.
    Returns (product_name_without_brand, preferred_brand_or_None)
    """
    cleaned = normalize_text(text)
    if not cleaned:
        return text or "", None

    # Alias normalization first (typos like "amool milk")
    for alias, canonical in BRAND_ALIASES.items():
        token = f" {alias} "
        if cleaned == alias or f" {cleaned} ".find(token) >= 0:
            cleaned = normalize_text(cleaned.replace(alias, canonical))

    preferred = None
    for brand in BRAND_KEYWORDS:
        if cleaned == brand:
            return cleaned, brand
        if cleaned.startswith(brand + " "):
            preferred = brand
            cleaned = cleaned[len(brand):].strip()
            break
        if cleaned.endswith(" " + brand):
            preferred = brand
            cleaned = cleaned[: -len(brand)].strip()
            break
        # brand in the middle: "toned amul milk"
        token = f" {brand} "
        if token in f" {cleaned} ":
            preferred = brand
            cleaned = cleaned.replace(brand, " ").strip()
            cleaned = normalize_text(cleaned)
            break

    return cleaned if cleaned else (text or ""), preferred


def brand_matches(preferred: str, actual: str) -> bool:
    if not preferred:
        return True
    pref = normalize_text(preferred)
    act = normalize_text(actual)
    if not act:
        return False
    return pref == act or pref in act or act in pref


def display_name(product_name: str, brand: str = None, preferred_brand: str = None) -> str:
    """Human-readable label, preferring actual brand then requested brand."""
    name = (product_name or "").strip()
    b = (brand or preferred_brand or "").strip()
    if not b:
        return name.title() if name == name.lower() else name
    # Avoid "Amul Amul Milk"
    if name.lower().startswith(b.lower()):
        return name.title() if name == name.lower() else name
    return f"{b.title()} {name.title() if name == name.lower() else name}"
