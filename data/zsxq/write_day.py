#!/usr/bin/env python3
"""Merge one Q&A item into data/zsxq/YYYY-MM-DD.json (schema_version=1)."""
from __future__ import annotations
import argparse, hashlib, json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
GROUP_URL = "https://wx.zsxq.com/group/88511822141542"
TZ = ZoneInfo("Asia/Shanghai")

def item_id(date: str, question: str) -> str:
    return "zsxq-" + hashlib.sha1(f"{date}|{question}".encode()).hexdigest()[:12]

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True, help="YYYY-MM-DD (post date, Asia/Shanghai)")
    p.add_argument("--question", required=True)
    p.add_argument("--answer", required=True)
    p.add_argument("--tags", default="", help="comma-separated")
    p.add_argument("--url", default=GROUP_URL)
    p.add_argument("--rank", type=int, default=None)
    args = p.parse_args()

    path = ROOT / f"{args.date}.json"
    if path.exists():
        doc = json.loads(path.read_text())
    else:
        doc = {
            "schema_version": 1,
            "source": "zsxq-changgong",
            "title": "长弓小子设计思享 · 问答",
            "planet": "长弓小子设计思享",
            "group_url": GROUP_URL,
            "date": args.date,
            "updated_at": "",
            "count": 0,
            "items": [],
        }

    iid = item_id(args.date, args.question)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    items = {it["id"]: it for it in doc.get("items", [])}
    rank = args.rank if args.rank is not None else (len(items) + 1 if iid not in items else items[iid].get("rank", len(items)))
    items[iid] = {
        "id": iid,
        "date": args.date,
        "question": args.question,
        "answer_summary": args.answer,
        "tags": tags,
        "url": args.url or GROUP_URL,
        "rank": rank,
    }
    ordered = sorted(items.values(), key=lambda x: (x.get("rank", 999), x["id"]))
    for i, it in enumerate(ordered, 1):
        it["rank"] = i
    doc["items"] = ordered
    doc["count"] = len(ordered)
    doc["updated_at"] = datetime.now(TZ).isoformat(timespec="seconds")
    doc["date"] = args.date
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print(path)

if __name__ == "__main__":
    main()
