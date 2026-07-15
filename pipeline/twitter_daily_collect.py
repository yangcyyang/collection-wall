#!/usr/bin/env python3
"""推特日报：硬规则初筛 + 单日 JSON 追加去重。

重要：
  title / summary / recommend_reason / tags **不得**由本脚本模板生成。
  hard-filter 只产出候选池；字段由 Agent 填写后，用 merge-day 并入日文件。

节奏（2026-07-15）：
  每天 12:00 / 00:00 各一趟；窗口约 12 小时；
  每趟上限 15、单日上限 30（均不保底）；
  同日文件 append + 按 id 去重，禁止覆盖抹掉另一趟。

短推契约：
  SHORT_TWEET_THRESHOLD = 200
  短推无 title；中文 summary=全文；英文 summary=完整中文翻译

用法：
  python3 pipeline/twitter_daily_collect.py --mode hard-filter \\
    --inputs a.json b.json --out /tmp/cands.json

  python3 pipeline/twitter_daily_collect.py --mode merge-day \\
    --day-file data/twitter/2026-07-15.json \\
    --batch /tmp/batch-items.json \\
    --date 2026-07-15
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_PER_AUTHOR = 2
MIN_CANDIDATES = 5  # 12h 窗口略放宽「候选过少」门槛
SHORT_TWEET_THRESHOLD = 200
PER_RUN_MAX = 15
DAY_MAX = 30
WINDOW_HOURS = 12

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
        for k in ("data", "tweets", "results", "items", "candidates", "batch"):
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


def mode_hard_filter(args: argparse.Namespace) -> int:
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

    passed.sort(
        key=lambda t: (int(t.get("likes") or 0), len(t.get("text") or "")),
        reverse=True,
    )
    counts: dict[str, int] = {}
    candidates: list[dict[str, Any]] = []
    for t in passed:
        author = str(t.get("author") or "unknown")
        if counts.get(author, 0) >= args.max_per_author:
            rejected["author_cap"] = rejected.get("author_cap", 0) + 1
            continue
        text = (t.get("text") or "").strip()
        is_short = len(text) <= SHORT_TWEET_THRESHOLD
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
                "char_len": len(text),
                "is_short": is_short,
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
        "window_hours": WINDOW_HOURS,
        "per_run_max": PER_RUN_MAX,
        "day_max": DAY_MAX,
        "short_tweet_threshold": SHORT_TWEET_THRESHOLD,
        "candidates": candidates,
        "rejected": rejected,
        "instruction": (
            f"Select up to {PER_RUN_MAX} items (no floor). "
            f"If len(text)<={SHORT_TWEET_THRESHOLD}: omit title; "
            "Chinese → summary=full text; English → summary=full ZH translation. "
            f"If longer: Chinese title + abstract. "
            f"Then merge-day into data/twitter/YYYY-MM-DD.json (append+dedupe, day max {DAY_MAX})."
        ),
    }
    Path(args.out).write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "pool": len(pool),
                "candidates": len(candidates),
                "rejected": rejected,
                "per_run_max": PER_RUN_MAX,
                "window_hours": WINDOW_HOURS,
            },
            ensure_ascii=False,
        )
    )
    if len(candidates) < MIN_CANDIDATES:
        print(
            f"候选过少: {len(candidates)} < {MIN_CANDIDATES}",
            file=sys.stderr,
        )
        return 2
    return 0


def _parse_time(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.strip()
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        if "T" in s:
            return datetime.fromisoformat(s)
    except ValueError:
        pass
    try:
        return datetime.strptime(s, "%a %b %d %H:%M:%S %z %Y")
    except ValueError:
        return None


def mode_merge_day(args: argparse.Namespace) -> int:
    """把本批已填字段的 items 追加进日文件，按 id 去重。"""
    day_path = Path(args.day_file)
    batch_path = Path(args.batch)
    if not batch_path.exists():
        print(f"batch missing: {batch_path}", file=sys.stderr)
        return 1

    batch_raw = json.loads(batch_path.read_text(encoding="utf-8"))
    if isinstance(batch_raw, dict):
        batch_items = batch_raw.get("items") or batch_raw.get("batch") or []
    else:
        batch_items = batch_raw
    if not isinstance(batch_items, list):
        print("batch must be list or {items:[]}", file=sys.stderr)
        return 1

    per_run_max = int(args.per_run_max)
    day_max = int(args.day_max)
    batch_items = [x for x in batch_items if isinstance(x, dict) and x.get("id")]
    if len(batch_items) > per_run_max:
        print(
            f"WARN batch {len(batch_items)} > per_run_max {per_run_max}, truncating",
            file=sys.stderr,
        )
        batch_items = batch_items[:per_run_max]

    if day_path.exists():
        day = json.loads(day_path.read_text(encoding="utf-8"))
    else:
        day = {
            "schema_version": 1,
            "date": args.date,
            "source": {
                "type": "following_timeline",
                "method": "opencli twitter search filter:follows",
                "account": "yangcyyang1",
                "window_hours": WINDOW_HOURS,
            },
            "items": [],
        }

    existing = day.get("items") or []
    by_id: dict[str, dict[str, Any]] = {}
    author_counts: dict[str, int] = {}
    for it in existing:
        if not isinstance(it, dict):
            continue
        tid = str(it.get("id") or "")
        if not tid:
            continue
        by_id[tid] = it
        a = str(it.get("author") or "unknown")
        author_counts[a] = author_counts.get(a, 0) + 1

    added = 0
    skipped_dup = 0
    skipped_author = 0
    skipped_cap = 0
    for it in batch_items:
        tid = str(it.get("id"))
        if tid in by_id:
            skipped_dup += 1
            continue
        if len(by_id) >= day_max:
            skipped_cap += 1
            continue
        a = str(it.get("author") or "unknown")
        if author_counts.get(a, 0) >= MAX_PER_AUTHOR:
            skipped_author += 1
            continue
        by_id[tid] = it
        author_counts[a] = author_counts.get(a, 0) + 1
        added += 1

    merged = list(by_id.values())

    def sort_key(it: dict[str, Any]):
        dt = _parse_time(str(it.get("created_at") or ""))
        return dt.timestamp() if dt else 0.0

    merged.sort(key=sort_key, reverse=True)
    for i, it in enumerate(merged, 1):
        it["rank"] = i

    now = datetime.now(timezone.utc)
    day["schema_version"] = day.get("schema_version") or 1
    day["date"] = args.date
    day["generated_at"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    src = day.setdefault("source", {})
    src["type"] = src.get("type") or "following_timeline"
    src["account"] = src.get("account") or "yangcyyang1"
    src["window_hours"] = WINDOW_HOURS
    src["method"] = src.get("method") or "opencli twitter search filter:follows"
    day["selection"] = {
        "target_count": day_max,
        "max_count": day_max,
        "per_run_max": per_run_max,
        "min_count": None,
        "window_hours": WINDOW_HOURS,
        "runs_per_day": 2,
        "merge": "append_dedupe_by_id",
        "actual_count": len(merged),
        "last_batch_added": added,
        "last_batch_skipped_dup": skipped_dup,
        "last_batch_skipped_author": skipped_author,
        "last_batch_skipped_day_cap": skipped_cap,
        "note": (
            f"双次采集/日；窗口{WINDOW_HOURS}h；每趟≤{per_run_max}；"
            f"单日≤{day_max}不保底；追加按id去重。"
        ),
        "short_tweet": {
            "threshold_chars": SHORT_TWEET_THRESHOLD,
            "title_optional": True,
            "summary_required_zh": True,
            "summary_semantics": "full_text_or_full_zh_translation",
        },
    }
    day["items"] = merged

    day_path.parent.mkdir(parents=True, exist_ok=True)
    day_path.write_text(
        json.dumps(day, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "day_file": str(day_path),
                "actual_count": len(merged),
                "added": added,
                "skipped_dup": skipped_dup,
                "skipped_author": skipped_author,
                "skipped_day_cap": skipped_cap,
            },
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--mode",
        default="hard-filter",
        choices=["hard-filter", "merge-day"],
    )
    ap.add_argument("--inputs", nargs="+", help="opencli JSON dumps (hard-filter)")
    ap.add_argument("--out", help="candidate pool output (hard-filter)")
    ap.add_argument("--max-per-author", type=int, default=MAX_PER_AUTHOR)
    ap.add_argument("--day-file", help="data/twitter/YYYY-MM-DD.json (merge-day)")
    ap.add_argument("--batch", help="batch items JSON (merge-day)")
    ap.add_argument("--date", help="YYYY-MM-DD (merge-day)")
    ap.add_argument("--per-run-max", type=int, default=PER_RUN_MAX)
    ap.add_argument("--day-max", type=int, default=DAY_MAX)
    args = ap.parse_args()

    if args.mode == "hard-filter":
        if not args.inputs or not args.out:
            print("hard-filter needs --inputs and --out", file=sys.stderr)
            return 1
        return mode_hard_filter(args)
    if args.mode == "merge-day":
        if not args.day_file or not args.batch or not args.date:
            print("merge-day needs --day-file --batch --date", file=sys.stderr)
            return 1
        return mode_merge_day(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
