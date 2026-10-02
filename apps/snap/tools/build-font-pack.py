#!/usr/bin/env python3
"""WEB-319 — self-hosted font pack builder.

Downloads the curated OFL families from Google Fonts as WOFF2 (latin +
latin-ext subsets), rewrites the CSS to local files, and emits
public/fonts/{fonts.css,files/*.woff2,LICENSES.md}. The gallery loads
fonts.css ONLY when a design selects a pack font — zero external font
requests, zero idle downloads (woff2 files load on font-family match).

Usage: python tools/build-font-pack.py
"""
import re
import urllib.request
from pathlib import Path

CSS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Inter:wght@400;500;600;700"
    "&family=Work+Sans:wght@400;500;600;700"
    "&family=Manrope:wght@400;500;600;700"
    "&family=Montserrat:wght@400;500;600;700"
    "&family=Space+Grotesk:wght@400;500;600;700"
    "&family=Bebas+Neue"
    "&family=Playfair+Display:wght@400;500;600;700"
    "&family=Cormorant+Garamond:wght@400;500;600;700"
    "&family=Lora:wght@400;500;600;700"
    "&family=Libre+Baskerville:wght@400;700"
    "&family=DM+Serif+Display"
    "&family=Fraunces:wght@400;600;700"
    "&display=swap"
)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
KEEP_SUBSETS = {"latin", "latin-ext"}
OFL_TEXT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt"

OUT = Path(__file__).resolve().parent.parent / "public" / "fonts"
FILES = OUT / "files"


def fetch(url: str, binary: bool = False, timeout: int = 60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read() if binary else r.read().decode()


def main() -> None:
    FILES.mkdir(parents=True, exist_ok=True)
    css = fetch(CSS_URL)
    # blocks: optional preceding /* subset */ comment + @font-face {...}
    blocks = re.findall(r"(?:/\*\s*([a-z0-9-]+)\s*\*/\s*)?(@font-face\s*\{[^}]+\})", css)
    out_rules: list[str] = []
    seen: set[str] = set()
    families: dict[str, str] = {}
    total = 0
    for subset, rule in blocks:
        if subset not in KEEP_SUBSETS:
            continue
        family = re.search(r"font-family:\s*'([^']+)'", rule).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", rule).group(1)
        url = re.search(r"url\((https://[^)]+)\)", rule).group(1)
        key = re.sub(r"[^a-z0-9]+", "-", family.lower()).strip("-")
        name = f"{key}-{weight}{'' if subset == 'latin' else '-ext'}.woff2"
        if name not in seen:
            data = fetch(url, binary=True)
            (FILES / name).write_bytes(data)
            seen.add(name)
            total += len(data)
            families[family] = key
        out_rules.append(rule.replace(url, f"files/{name}"))
        print(f"{family} {weight} {subset} -> {name}")

    (OUT / "fonts.css").write_text("\n".join(out_rules) + "\n")
    try:
        ofl = fetch(OFL_TEXT_URL, timeout=30)
    except Exception:
        ofl = "(Fetch the SIL Open Font License 1.1 text from https://openfontlicense.org)"
    listed = "\n".join(f"- {fam} (directory `{key}`) — SIL Open Font License 1.1" for fam, key in sorted(families.items()))
    (OUT / "LICENSES.md").write_text(
        "# Font licenses\n\n"
        "All families in this pack are licensed under the SIL Open Font License 1.1\n"
        "(free for commercial use, embedding, and redistribution with the license\n"
        "intact). Served self-hosted from this directory — no external font requests.\n\n"
        + listed + "\n\n---\n\n```\n" + ofl + "\n```\n"
    )
    print(f"\n{len(seen)} woff2 files, {total // 1024} KB total, {len(out_rules)} rules -> {OUT}")


if __name__ == "__main__":
    main()
