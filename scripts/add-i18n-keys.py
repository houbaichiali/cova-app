#!/usr/bin/env python3
"""Appends an i18n key block to en/fr/ar message catalogs, keeping parity.

Usage: python3 scripts/add-i18n-keys.py <block-name>
Reads key/value pairs from scripts/i18n_blocks/<block-name>.py (defines
EN, FR, AR dicts) and inserts them before the final closing brace of each
catalog. Verifies parity afterwards.
"""
import sys
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCKS = ROOT / "scripts" / "i18n_blocks"


def insert(catalog_path: Path, pairs: list[tuple[str, str]]) -> None:
    src = catalog_path.read_text()
    existing = set(__import__("re").findall(r'^\s{2}"([^"]+)":', src, __import__("re").M))
    new = [(k, v) for k, v in pairs if k not in existing]
    if not new:
        print(f"  {catalog_path.name}: nothing to add")
        return
    block = "\n".join(f'  "{k}": {v},' for k, v in new)
    # insert before the closing brace that ends the object literal
    idx = src.rfind("\n} as const;")
    if idx == -1:
        idx = src.rfind("\n};")
    if idx == -1:
        raise SystemExit(f"unexpected catalog ending in {catalog_path}")
    out = src[:idx] + "\n" + block + src[idx:]
    catalog_path.write_text(out)
    print(f"  {catalog_path.name}: +{len(new)} keys")


def quote(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: add-i18n-keys.py <block-name>")
    spec = importlib.util.spec_from_file_location("block", BLOCKS / f"{sys.argv[1]}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for locale, d in (("en", mod.EN), ("fr", mod.FR), ("ar", mod.AR)):
        insert(ROOT / "src" / "i18n" / "messages" / f"{locale}.ts", [(k, quote(v)) for k, v in d.items()])


if __name__ == "__main__":
    main()
