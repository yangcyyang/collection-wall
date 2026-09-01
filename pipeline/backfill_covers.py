#!/usr/bin/env python3
"""Fill missing data/tools covers from each tool's own page.

Only writes covers/{id}.jpg and `cover`. Skips existing >2KB images.
Screenshot first; that page's og:image / twitter:image is the fallback.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "tools"
MIN_COVER_BYTES = 2048
MIN_COVER_EDGE = 400
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0 Safari/537.36"
)
BOT_WALL_MARKERS = (
    "just a moment",
    "attention required",
    "checking your browser",
    "enable javascript and cookies",
    "cf-browser-verification",
    "access denied",
    "pardon our interruption",
    "verify you are human",
)
META_NAMES = ("og:image", "twitter:image")


def load_tool_record(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _cover_candidates(record: dict[str, Any], data_dir: Path) -> list[Path]:
    covers_dir = data_dir / "covers"
    rid = str(record.get("id") or "")
    field = str(record.get("cover") or "").strip()
    paths: list[Path] = []
    if field:
        paths.append(data_dir / field)
        paths.append(covers_dir / Path(field).name)
    if rid:
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            paths.append(covers_dir / f"{rid}{ext}")
    return list(dict.fromkeys(paths))


def has_real_cover(record: dict[str, Any], data_dir: Path, min_bytes: int = MIN_COVER_BYTES) -> bool:
    for path in _cover_candidates(record, data_dir):
        if path.is_file() and path.stat().st_size > min_bytes:
            return True
    return False


def find_missing_cover_records(data_dir: Path) -> list[dict[str, Any]]:
    missing: list[dict[str, Any]] = []
    for path in sorted(data_dir.glob("*.json")):
        try:
            record = load_tool_record(path)
        except Exception:
            continue
        record["_path"] = str(path)
        url = str(record.get("url") or "").strip()
        if not url:
            continue
        if not has_real_cover(record, data_dir):
            missing.append(record)
    return missing


def is_uniform_image(jpg_bytes: bytes, threshold: float = 0.85) -> bool:
    if not jpg_bytes or len(jpg_bytes) < 1000:
        return True
    try:
        img = Image.open(io.BytesIO(jpg_bytes)).convert("RGB")
        w, h = img.size
        samples = [img.getpixel((x, y)) for y in range(0, h, 8) for x in range(0, w, 8)]
        if not samples:
            return True
        quantized = [(r // 16, g // 16, b // 16) for r, g, b in samples]
        _color, count = Counter(quantized).most_common(1)[0]
        return count / len(quantized) > threshold
    except Exception:
        return False


def is_usable_cover(image_bytes: bytes | None, min_bytes: int = MIN_COVER_BYTES) -> bool:
    if not image_bytes or len(image_bytes) <= min_bytes:
        return False
    if is_uniform_image(image_bytes):
        return False
    try:
        width, height = Image.open(io.BytesIO(image_bytes)).size
    except Exception:
        return False
    if max(width, height) < MIN_COVER_EDGE:
        return False
    if width == height and width < MIN_COVER_EDGE:
        return False
    return True


def to_jpeg(raw: bytes, max_edge: int = 1600) -> bytes | None:
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        width, height = img.size
        longest = max(width, height)
        if longest > max_edge:
            scale = max_edge / longest
            img = img.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()
    except Exception:
        return None


def extract_social_image_url(html: str, base_url: str) -> str | None:
    if not html:
        return None
    for name in META_NAMES:
        patterns = (
            rf"<meta[^>]+(?:property|name)=['\"]{re.escape(name)}['\"][^>]+content=['\"]([^'\"]+)['\"]",
            rf"<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+(?:property|name)=['\"]{re.escape(name)}['\"]",
        )
        for pat in patterns:
            match = re.search(pat, html, re.I)
            if match:
                return urljoin(base_url, match.group(1).strip())
    return None


def apply_cover(record_path: Path, image_bytes: bytes, data_dir: Path | None = None) -> dict[str, Any]:
    record = load_tool_record(record_path)
    data_dir = data_dir or record_path.parent
    rid = str(record.get("id") or record_path.stem)
    covers_dir = data_dir / "covers"
    covers_dir.mkdir(parents=True, exist_ok=True)
    cover_path = covers_dir / f"{rid}.jpg"
    cover_path.write_bytes(image_bytes)
    record["cover"] = f"covers/{rid}.jpg"
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return record


def looks_like_bot_wall(title: str, html: str = "") -> bool:
    blob = f"{title}\n{html[:4000]}".lower()
    return any(marker in blob for marker in BOT_WALL_MARKERS)


def download_image(url: str, timeout: float = 20) -> bytes | None:
    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "image/*,*/*;q=0.8"},
            timeout=timeout,
            stream=True,
        )
        if response.status_code >= 400:
            return None
        raw = response.content
        if len(raw) > 8_000_000:
            return None
        return to_jpeg(raw)
    except Exception:
        return None


def fetch_social_image_from_html(url: str, html: str | None = None) -> bytes | None:
    page_html = html
    if page_html is None:
        try:
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
                timeout=20,
            )
            if response.status_code >= 400:
                return None
            page_html = response.text
        except Exception:
            return None
    image_url = extract_social_image_url(page_html, url)
    if not image_url:
        return None
    if urlparse(image_url).scheme not in ("http", "https"):
        return None
    return download_image(image_url)


def _page_social_image(page, url: str) -> bytes | None:
    try:
        og = page.evaluate(
            """() => {
            const m = document.querySelector('meta[property="og:image"]')
                  || document.querySelector('meta[name="og:image"]')
                  || document.querySelector('meta[name="twitter:image"]')
                  || document.querySelector('meta[property="twitter:image"]');
            return m ? (m.content || m.getAttribute('content')) : null;
        }"""
        )
    except Exception:
        og = None
    if og:
        image_url = urljoin(url, str(og).strip())
        image = download_image(image_url)
        if is_usable_cover(image):
            return image
    try:
        html = page.content()
    except Exception:
        html = ""
    image = fetch_social_image_from_html(url, html)
    return image if is_usable_cover(image) else None


def capture_cover(page, url: str) -> tuple[bytes | None, str | None, str | None]:
    """Return (jpeg_bytes, source, error). source is screenshot|og:image."""
    try:
        response = page.goto(url, timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
    except Exception as exc:
        image = fetch_social_image_from_html(url)
        if is_usable_cover(image):
            return image, "og:image", None
        return None, None, f"timeout/navigation: {exc}"[:240]

    status = response.status if response is not None else 0
    title = ""
    html = ""
    try:
        title = page.title() or ""
        html = page.content()
    except Exception:
        pass

    if status >= 400:
        return None, None, f"http {status}"
    if looks_like_bot_wall(title, html):
        image = fetch_social_image_from_html(url)
        if is_usable_cover(image):
            return image, "og:image", None
        return None, None, "bot wall"

    screenshot = _viewport_screenshot(page)
    if screenshot and is_uniform_image(screenshot, threshold=0.85):
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        page.wait_for_timeout(4000)
        screenshot = _viewport_screenshot(page) or screenshot

    if is_usable_cover(screenshot):
        return screenshot, "screenshot", None
    image = _page_social_image(page, url) or fetch_social_image_from_html(url, html)
    if is_usable_cover(image):
        return image, "og:image", None
    return None, None, "blank/uniform screenshot" if screenshot else "no usable screenshot or og:image"


def _viewport_screenshot(page) -> bytes | None:
    try:
        return page.screenshot(full_page=False, type="jpeg", quality=85, timeout=10000, animations="disabled")
    except Exception:
        return None


def launch_browser(playwright):
    args = ["--disable-dev-shm-usage", "--no-sandbox"]
    try:
        return playwright.chromium.launch(headless=True, args=args)
    except Exception:
        return playwright.chromium.launch(headless=True, channel="chrome", args=args)


def backfill(data_dir: Path, delay: float, limit: int | None, ids: set[str] | None, dry_run: bool) -> dict[str, Any]:
    from playwright.sync_api import sync_playwright

    records = find_missing_cover_records(data_dir)
    if ids:
        records = [row for row in records if row.get("id") in ids]
    if limit is not None:
        records = records[:limit]

    report = {"attempted": 0, "filled": [], "skipped": [], "sources": Counter()}
    if not records:
        return report

    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=USER_AGENT,
            ignore_https_errors=True,
        )
        page = context.new_page()
        try:
            for index, record in enumerate(records):
                url = str(record["url"]).strip()
                rid = str(record["id"])
                name = str(record.get("name") or rid)
                report["attempted"] += 1
                print(f"[{index + 1}/{len(records)}] {rid} {name} {url}", flush=True)
                image, source, error = capture_cover(page, url)
                if dry_run:
                    status = "dry-run-ok" if image else f"dry-run-skip:{error}"
                    print(f"  → {status} source={source}", flush=True)
                elif image and source:
                    apply_cover(Path(record["_path"]), image, data_dir=data_dir)
                    report["filled"].append({"id": rid, "name": name, "url": url, "source": source})
                    report["sources"][source] += 1
                    print(f"  → wrote covers/{rid}.jpg via {source}", flush=True)
                else:
                    report["skipped"].append({"id": rid, "name": name, "url": url, "reason": error or "unknown"})
                    print(f"  → skip ({error})", flush=True)
                if index + 1 < len(records) and delay > 0:
                    time.sleep(delay)
        finally:
            context.close()
            browser.close()
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill missing tool cover images from each tool URL")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--delay", type=float, default=1.2, help="seconds between hosts")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--ids", nargs="*", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)

    data_dir = args.data_dir.resolve()
    ids = set(args.ids) if args.ids else None
    report = backfill(data_dir, delay=args.delay, limit=args.limit, ids=ids, dry_run=args.dry_run)
    payload = {
        "attempted": report["attempted"],
        "filled": report["filled"],
        "skipped": report["skipped"],
        "sources": dict(report["sources"]),
        "filled_count": len(report["filled"]),
        "skipped_count": len(report["skipped"]),
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    print(text, flush=True)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
