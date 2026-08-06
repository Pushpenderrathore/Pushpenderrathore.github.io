#!/usr/bin/env python3
"""
Generate the Content-Security-Policy meta tag for each page.

GitHub Pages serves fixed response headers and offers no way to add our own,
so the policy has to travel in a <meta http-equiv> tag inside each document.

The policy allows no inline script. Every inline <script> block is permitted by
its SHA-256 hash instead, which means this script MUST be re-run whenever one of
those blocks changes - otherwise the browser silently refuses to run it and the
page half works. Run it and commit the result:

    python3 scripts/update_csp.py

Two limits of the meta-tag delivery, both unavoidable here:
  * frame-ancestors is ignored in a meta tag, so clickjacking protection still
    depends on an X-Frame-Options response header that GitHub Pages will not set.
  * report-uri / report-to are ignored too, so violations are console-only.
"""

from __future__ import annotations

import base64
import hashlib
import pathlib
import re
import sys

# Every page the site serves. assets/CV.html was missed when the policy was
# first added, so it shipped with no CSP at all while the other three were
# covered: scanning that one page reported a HIGH where the rest were clean.
PAGES = ("index.html", "gsoc.html", "prs.html", "assets/CV.html")

# Origins this site actually loads from, verified against the markup:
#   cdn.jsdelivr.net       three.js + meshline, via the importmap (hero lanyard)
#   cdnjs.cloudflare.com   Font Awesome stylesheet and its font files
#   fonts.googleapis.com   Google Fonts stylesheet
#   fonts.gstatic.com      Google Fonts font files
#   api.github.com         live PR status on prs.html
#   count.getloli.com      visitor counter image
BASE_DIRECTIVES: list[tuple[str, str]] = [
    ("default-src",     "'self'"),
    ("base-uri",        "'self'"),
    ("object-src",      "'none'"),
    ("form-action",     "'self'"),
    # Images stay permissive: they are low risk and come from several hosts.
    ("img-src",         "'self' data: https:"),
    ("font-src",        "'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com"),
    # 'unsafe-inline' is required for style: the page uses inline style
    # attributes, which no hash can cover, and script.js injects a <style>
    # element at runtime.
    ("style-src",       "'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com"),
    ("connect-src",     "'self' https://api.github.com"),
    ("frame-src",       "'none'"),
    ("upgrade-insecure-requests", ""),
]

SCRIPT_ORIGINS = "'self' https://cdn.jsdelivr.net"

# Referrer-Policy is the other header a document can apply from its own markup.
# X-Frame-Options, X-Content-Type-Options, Permissions-Policy and HSTS are
# ignored in a meta tag, so those stay out of reach on GitHub Pages.
REFERRER_TAG = '<meta name="referrer" content="strict-origin-when-cross-origin">'

META_RE = re.compile(
    r'\n?[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>'
    r'|\n?[ \t]*<meta name="referrer"[^>]*>',
    re.IGNORECASE,
)
# Inline blocks only: anything carrying a src= is an external file.
INLINE_SCRIPT_RE = re.compile(
    r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
ANCHOR_RE = re.compile(r'([ \t]*)<meta name="viewport"[^>]*>')


def script_hashes(html: str) -> list[str]:
    """CSP hash for every inline script block, in document order."""
    return [
        "'sha256-" + base64.b64encode(
            hashlib.sha256(block.encode()).digest()
        ).decode() + "'"
        for block in INLINE_SCRIPT_RE.findall(html)
    ]


def build_policy(hashes: list[str]) -> str:
    directives = [
        f"{name} {value}".strip() for name, value in BASE_DIRECTIVES
    ]
    directives.insert(
        1, " ".join(["script-src", SCRIPT_ORIGINS, *hashes])
    )
    return "; ".join(directives)


def update(path: pathlib.Path) -> bool:
    html = path.read_text()
    stripped = META_RE.sub("", html)

    policy = build_policy(script_hashes(stripped))
    tag = f'<meta http-equiv="Content-Security-Policy" content="{policy}">'

    anchor = ANCHOR_RE.search(stripped)
    if not anchor:
        print(f"  {path.name}: no <meta name=\"viewport\"> anchor found", file=sys.stderr)
        return False

    indent = anchor.group(1)
    updated = stripped.replace(
        anchor.group(0),
        f"{anchor.group(0)}\n{indent}{tag}\n{indent}{REFERRER_TAG}",
        1,
    )

    if updated == html:
        print(f"  {path.name}: already up to date")
        return True

    path.write_text(updated)
    print(f"  {path.name}: policy written ({len(script_hashes(stripped))} inline script hashes)")
    return True


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent.parent
    print("Updating Content-Security-Policy meta tags")
    ok = True
    for name in PAGES:
        path = root / name
        if not path.exists():
            print(f"  {name}: missing, skipped", file=sys.stderr)
            ok = False
            continue
        ok = update(path) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
