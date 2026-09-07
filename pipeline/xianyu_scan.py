#!/usr/bin/env python3
"""闲鱼公开搜索抓取（不登录 adapter）。

成品仍由 Agent 按 docs/features/F007-xianyu-tab.md 写成
data/xianyu/demands.json。本脚本只产出原始卡片 JSON。

  python3 pipeline/xianyu_scan.py --out /tmp/xianyu-scan.json
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import quote

DEFAULT_QUERIES = [
    "Midjourney",
    "ChatGPT",
    "Claude",
    "AI求购",
    "即梦",
    "AI短剧",
    "数字人",
]
EXTRACT_JS = """(() => {
  const anchors = [...document.querySelectorAll("a[href*='item?id=']")];
  const seen = new Set();
  const out = [];
  for (const a of anchors) {
    const m = a.href.match(/item\\?id=(\\d+)/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const text = (a.innerText || "").replace(/\\s+/g, " ").trim();
    const price = (text.match(/¥\\s*([\\d.]+)/) || [null, ""])[1];
    const want = (text.match(/(\\d+)\\s*人想要/) || [null, ""])[1];
    out.push({
      item_id: m[1],
      url: "https://www.goofish.com/item?id=" + m[1],
      text: text.slice(0, 220),
      price: price,
      want: want,
    });
    if (out.length >= 25) break;
  }
  return JSON.stringify({title: document.title, n: out.length, items: out});
})()"""


def run(argv: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, capture_output=True, text=True, check=False)


def extract_json(blob: str) -> dict:
    start = blob.find("{")
    end = blob.rfind("}")
    if start < 0 or end <= start:
        return {"ok": False, "raw": blob[:800]}
    return json.loads(blob[start : end + 1])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="/tmp/xianyu-scan.json")
    parser.add_argument("--profile", default="byct8zta")
    parser.add_argument("--sleep", type=float, default=4.0)
    args = parser.parse_args()
    base = ["opencli", "--profile", args.profile]
    rows = []
    for query in DEFAULT_QUERIES:
        url = "https://www.goofish.com/search?q=" + quote(query)
        run(base + ["browser", "xy", "open", url, "--window", "foreground"])
        time.sleep(args.sleep)
        ev = run(base + ["browser", "xy", "eval", EXTRACT_JS])
        payload = {"query": query, "ok": False, "items": []}
        try:
            data = extract_json(ev.stdout)
            payload["ok"] = True
            payload["title"] = data.get("title")
            payload["items"] = data.get("items") or []
        except Exception as exc:
            payload["error"] = str(exc)
            payload["raw"] = (ev.stdout + ev.stderr)[:800]
        rows.append(payload)
        print(json.dumps({"query": query, "n": len(payload["items"])}, ensure_ascii=False))
    Path(args.out).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": args.out, "queries": len(rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
