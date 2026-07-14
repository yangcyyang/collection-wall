#!/usr/bin/env python3
"""推特日报：硬规则初筛（脚本）+ 人工/Agent 字段区隔。

重要（2026-07-14 验收结论）：
  title / summary / recommend_reason / tags **不得**由本脚本模板生成。
  本脚本只负责：合并 opencli JSON、硬规则过滤、作者封顶、输出候选池。

用法：
  python3 pipeline/twitter_daily_collect.py \\
    --mode hard-filter \\
    --inputs /tmp/a.json /tmp/b.json \\
    --out /tmp/tw-candidates.json

exit 0 写出候选；exit 2 候选过少（默认 <8）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

MAX_PER_AUTHOR = 2
MIN_CANDIDATES = 8

PROMO = re.compile(
    r"(MILLIONAIRE|BLUEPRINT|FIRST\s*5|STOP PAYING|7-FIGURE|FREE\s+AI\s+Course|"
    r"Like \+ comment|Link in the comments|FULL COURSE|HOUR COURSE|feels illegal|"
    r"HOLY SH|Get YOUR FREE|午夜|点链接领取)",
    re.I,
)
STOCK_TRADE = re.compile(
    r"(建仓|慢慢买|浮亏|散户|memecoin|Launchpad|股价|市值蒸发|股票事件|"
    r"\$ORCL|从今天开始建仓)",
    re.I,
)
ENTERTAINMENT = re.compile(
    r"(サンリオ|キティ|マイメロ|ラテ|着ぐるみ|ゴジラ|倒膜|Bath Time|コミケ|"
    r"低胸|交友|烤牛肉|成品号|♡ありがとう)",
    re.I,
)
NOSTALGIA = re.compile(r"(7年前|2015\s*年|还记得吗)", re.I)
AI_SIGNAL = re.compile(
    r"(AI|LLM|GPT|Claude|OpenAI|Anthropic|Gemini|Grok|Agent|Codex|DeepSeek|"
    r"Fable|Artifacts|opencode|大模型|智能体|模型|Cursor|ChatGPT|Hermes|"
    r"Obsidian|NotebookLM|prompt|推理|coding agent|黑客松)",
    re.I,
)
NON_AI_NEWS = re.compile(r"(旱稻|古城迎客|機動車|兩岸進出口|减脂餐|冷笑话)", re.I)


def load_json_tweets(path: Path) -> list[dict[str, Any]]:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    if not raw.strip():
        return []
    starts = [i for i in (raw.find("["), raw.find("{")) if i >= 0]
    if not starts:
        return []
    data = json.loads(raw[min(starts) :])
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("data", "tweets", "results", "items", "candidates"):
            v = data.get(k)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


def hard_reject(t: dict[str, Any]) -> str | None:
    text = (t.get("text") or "").strip()
    if len(text) < 12:
        return "empty_or_thin"
    if PROMO.search(text):
        return "promo"
    if STOCK_TRADE.search(text):
        return "stock_trade"
    if ENTERTAINMENT.search(text) and not AI_SIGNAL.search(text):
        return "entertainment"
    if NOSTALGIA.search(text):
        return "nostalgia"
    if NON_AI_NEWS.search(text):
        return "non_ai_news"
    if text.startswith("@") and len(text) < 60 and not AI_SIGNAL.search(text):
        return "short_reply"
    if not AI_SIGNAL.search(text):
        return "no_ai_signal"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="hard-filter", choices=["hard-filter"])
    ap.add_argument("--inputs", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-per-author", type=int, default=MAX_PER_AUTHOR)
    args = ap.parse_args()

    pool: dict[str, dict[str, Any]] = {}
    for p in args.inputs:
        path = Path(p)
        if not path.exists():
            print(f"WARN missing {path}", file=sys.stderr)
            continue
        for t in load_json_tweets(path):
            tid = str(t.get("id") or "")
            if tid:
                pool[tid] = t

    rejected: dict[str, int] = {}
    passed: list[dict[str, Any]] = []
    for t in pool.values():
        why = hard_reject(t)
        if why:
            rejected[why] = rejected.get(why, 0) + 1
            continue
        passed.append(t)

    passed.sort(key=lambda t: (int(t.get("likes") or 0), len(t.get("text") or "")), reverse=True)
    counts: dict[str, int] = {}
    candidates: list[dict[str, Any]] = []
    for t in passed:
        author = str(t.get("author") or "unknown")
        if counts.get(author, 0) >= args.max_per_author:
            rejected["author_cap"] = rejected.get("author_cap", 0) + 1
            continue
        candidates.append(
            {
                "id": str(t.get("id")),
                "author": t.get("author"),
                "author_bio": (t.get("bio") or t.get("author_bio") or "")[:160],
                "text": t.get("text"),
                "url": t.get("url"),
                "created_at": t.get("created_at"),
                "likes": t.get("likes"),
                "views": t.get("views"),
                "has_media": t.get("has_media"),
                "media_urls": t.get("media_urls") or [],
                # intentionally empty — Agent fills these after reading
                "title": None,
                "summary": None,
                "recommend_reason": None,
                "tags": [],
            }
        )
        counts[author] = counts.get(author, 0) + 1

    out = {
        "mode": "hard-filter",
        "pool": len(pool),
        "candidates": candidates,
        "rejected": rejected,
        "instruction": (
            "Agent must read each candidate and fill title/summary/"
            "recommend_reason/tags in Chinese; do not use truncation templates."
        ),
    }
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pool": len(pool), "candidates": len(candidates), "rejected": rejected}, ensure_ascii=False))
    if len(candidates) < MIN_CANDIDATES:
        print(f"候选过少: {len(candidates)} < {MIN_CANDIDATES}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
