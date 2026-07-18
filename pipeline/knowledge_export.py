#!/usr/bin/env python3
"""知识总结导出：400知识库 → data/knowledge/recent.json（F005）。

只取标准格式卡（unit_id + unit_type ∈ 七类 + status=active），旧格式卡跳过。
摘要与要点为规则截取，不做 AI 重写，保证与库内原文一致。

用法：
  python3 pipeline/knowledge_export.py [--days 14] [--vault-dir PATH] [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

UNIT_TYPES = ("SKL", "SOL", "QST", "MTH", "CON", "OPI", "CAS")
DEFAULT_VAULT_UNITS = (
    "/Users/cy/Documents/03 life/AI design/OrbitOS-CN/400知识库/事实知识库/10_内容单元"
)
SUMMARY_MAX = 160
POINTS_MAX = 3
POINT_LEN_MAX = 80

FM_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)
H1_RE = re.compile(r"^# (.+)$", re.M)
SECTION_RE = re.compile(r"^## .+?\n+(.+?)(?=\n\n|\n##|$)", re.S | re.M)
POINT_RE = re.compile(r"^(?:\d+\.|-) (.+)$", re.M)


def parse_frontmatter(text: str) -> tuple[dict[str, str] | None, str]:
    m = FM_RE.match(text)
    if not m:
        return None, text
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "\t")):
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, m.group(2)


def extract_card(path: Path, vault_root: Path) -> dict | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    meta, body = parse_frontmatter(text)
    if not meta:
        return None
    if not meta.get("unit_id") or meta.get("unit_type") not in UNIT_TYPES:
        return None  # 旧格式卡：交给清理支线，不进导出
    if meta.get("status", "active") != "active":
        return None

    title_m = H1_RE.search(body)
    if not title_m:
        return None
    section_m = SECTION_RE.search(body)
    summary = re.sub(r"\s+", " ", section_m.group(1)).strip() if section_m else ""
    points = [p.strip()[:POINT_LEN_MAX] for p in POINT_RE.findall(body)[:POINTS_MAX]]

    return {
        "unit_id": meta["unit_id"],
        "type": meta["unit_type"],
        "title": title_m.group(1).strip(),
        "summary": summary[:SUMMARY_MAX],
        "points": points,
        "source": Path(meta.get("source_file", "")).name.removesuffix(".md"),
        "confidence": meta.get("confidence", "medium"),
        "ingested_at": meta.get("ingested_at", ""),
        "vault_path": str(path.relative_to(vault_root)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--vault-dir", default=DEFAULT_VAULT_UNITS)
    ap.add_argument("--out", default="data/knowledge/recent.json")
    args = ap.parse_args()

    units_dir = Path(args.vault_dir)
    if not units_dir.is_dir():
        print(f"vault dir missing: {units_dir}", file=sys.stderr)
        return 1
    # vault 根 = 事实知识库 的上级（OrbitOS-CN/400知识库 的上级是 vault）
    vault_root = units_dir.parents[2]

    cutoff = (datetime.now(timezone.utc) + timedelta(hours=8) - timedelta(days=args.days)).date().isoformat()

    cards: list[dict] = []
    total_pool = 0
    seen_ids: set[str] = set()
    for path in sorted(units_dir.rglob("*.md")):
        card = extract_card(path, vault_root)
        if card is None:
            continue
        total_pool += 1
        if card["ingested_at"] < cutoff:
            continue
        if card["unit_id"] in seen_ids:
            continue  # 重复 id 取先见者，清理支线负责根治
        seen_ids.add(card["unit_id"])
        cards.append(card)

    cards.sort(key=lambda c: (c["ingested_at"], c["type"]), reverse=True)

    out = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_days": args.days,
        "cutoff": cutoff,
        "total_pool": total_pool,
        "count": len(cards),
        "items": cards,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(out_path), "count": len(cards), "pool": total_pool, "cutoff": cutoff}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
