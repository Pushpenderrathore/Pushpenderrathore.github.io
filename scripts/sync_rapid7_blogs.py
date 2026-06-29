#!/usr/bin/env python3
"""Sync Rapid7 Metasploit blog posts into data/rapid7-blogs.json.

Fetches the blog tag page, finds any posts not already in the JSON,
fetches each new post to extract its publish date from meta tags,
then writes the updated JSON sorted newest-first.

Preserves manually-set fields (gsoc_feature, etc.) for existing entries.
"""

import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.rapid7.com"
TAG_URL = BASE_URL + "/blog/tag/metasploit/"
DATA_FILE = Path(__file__).parent.parent / "data" / "rapid7-blogs.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; blog-sync-bot/1.0)"}


def load_existing():
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return []


def fetch_tag_page():
    r = requests.get(TAG_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


def extract_posts(soup):
    """Return list of (title, url) from the tag page."""
    posts = []
    seen = set()
    for a in soup.find_all("a", href=re.compile(r"^/blog/post/")):
        h3 = a.find("h3")
        if not h3:
            continue
        title = h3.get_text(strip=True)
        url = BASE_URL + a["href"].rstrip("/") + "/"
        if url in seen:
            continue
        seen.add(url)
        posts.append({"title": title, "url": url})
    return posts


def fetch_post_date(url):
    """Try to extract publish date from post page meta tags."""
    try:
        time.sleep(0.5)
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        # Try Open Graph / article published time first
        for prop in ("article:published_time", "og:published_time"):
            m = soup.find("meta", property=prop)
            if m and m.get("content"):
                return m["content"][:10]

        # Try <time datetime="...">
        t = soup.find("time", attrs={"datetime": True})
        if t:
            return t["datetime"][:10]

        # Try name="publish_date"
        m = soup.find("meta", attrs={"name": "publish_date"})
        if m and m.get("content"):
            return m["content"][:10]

    except Exception as exc:
        print(f"  Warning: could not fetch {url}: {exc}", file=sys.stderr)
    return ""


def main():
    existing = load_existing()
    existing_by_url = {p["url"]: p for p in existing}

    print(f"Fetching {TAG_URL} ...")
    soup = fetch_tag_page()
    tag_posts = extract_posts(soup)
    print(f"Found {len(tag_posts)} posts on tag page.")

    new_posts = []
    for post in tag_posts:
        if post["url"] in existing_by_url:
            continue
        print(f"  New post: {post['title']}")
        print(f"    Fetching date from {post['url']} ...")
        date = fetch_post_date(post["url"])
        print(f"    Date: {date or '(unknown)'}")
        new_posts.append({
            "title": post["title"],
            "url": post["url"],
            "date": date,
            "gsoc_feature": False,
        })

    if not new_posts:
        print("No new posts found. Nothing to update.")
        return

    # Merge: new posts + existing (preserving manual fields on existing)
    all_posts = new_posts + existing

    # Sort newest-first; entries with no date go to end
    all_posts.sort(key=lambda p: p.get("date") or "0000-00-00", reverse=True)

    DATA_FILE.write_text(json.dumps(all_posts, indent=2) + "\n")
    print(f"Written {len(all_posts)} posts to {DATA_FILE}.")


if __name__ == "__main__":
    main()
