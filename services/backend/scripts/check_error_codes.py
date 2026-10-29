#!/usr/bin/env python3
"""Fail if any SQL raise uses an error code missing from errors.json or a SQLSTATE that disagrees with it.

Run from services/backend: python3 scripts/check_error_codes.py
"""
import json
import pathlib
import re
import sys

here = pathlib.Path(__file__).resolve().parent.parent
spec = json.loads((here.parent.parent / "packages" / "contracts" / "errors.json").read_text())
codes = {c["code"]: c["sqlstate"] for c in spec["codes"]}
pats = [
    re.compile(r"raise exception '([A-Z][A-Z0-9_]+)' using errcode = '(P0\d{3})'"),
    re.compile(r"errcode = '(P0\d{3})', message = '([A-Z][A-Z0-9_]+)'"),
]
bad, seen = [], 0
for f in sorted((here / "supabase" / "migrations").glob("*.sql")):
    for n, line in enumerate(f.read_text().splitlines(), 1):
        for i, p in enumerate(pats):
            for m in p.finditer(line):
                code, state = (m.group(1), m.group(2)) if i == 0 else (m.group(2), m.group(1))
                seen += 1
                if code not in codes:
                    bad.append(f"{f.name}:{n}: {code} not in errors.json")
                elif codes[code] != state:
                    bad.append(f"{f.name}:{n}: {code} raised as {state}, errors.json says {codes[code]}")
if bad:
    print("\n".join(bad))
    sys.exit(1)
print(f"error codes OK: {seen} SQL raises match errors.json ({len(codes)} codes)")
