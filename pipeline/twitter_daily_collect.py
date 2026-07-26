#!/usr/bin/env python3
"""推特日报：硬规则初筛 + 单日 JSON 追加去重 + 场次目标日解析。

重要：
  title / summary / recommend_reason / tags **不得**由本脚本模板生成。
  hard-filter 只产出候选池；字段由 Agent 填写后，用 merge-day 并入日文件。

节奏（2026-07-15，宪宪日期边界）：
  12:00 午场：窗口=当天 00:00–12:00（北京），写**当天**文件（新建/覆盖式首写）
  00:00 夜场：窗口=前一天 12:00–24:00（北京），**追加前一天**文件（禁止写新日历日）
  每趟上限 15、单日上限 30（均不保底）；append + id 去重

短推契约：
  SHORT_TWEET_THRESHOLD = 200
  短推无 title；中文 summary=全文；英文 summary=完整中文翻译

用法：
  python3 pipeline/twitter_daily_collect.py --mode resolve-slot --slot noon|midnight
  python3 pipeline/twitter_daily_collect.py --mode hard-filter --inputs ... --out ...
  python3 pipeline/twitter_daily_collect.py --mode merge-day \\
    --day-file data/twitter/YYYY-MM-DD.json --batch batch.json --date YYYY-MM-DD --slot noon
  python3 pipeline/twitter_daily_collect.py --mode normalize-tags \\
    --twitter-dir data/twitter
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from functools import lru_cache
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

SHANGHAI = ZoneInfo("Asia/Shanghai")
ROOT = Path(__file__).resolve().parent
TAG_ALIASES_PATH = ROOT / "tag_aliases.json"
SCORE_WEIGHTS_PATH = ROOT / "score_weights.json"

MAX_PER_AUTHOR = 2
MIN_CANDIDATES = 5  # 12h 窗口略放宽「候选过少」门槛
SHORT_TWEET_THRESHOLD = 200
PER_RUN_MAX = 15
DAY_MAX = 30
WINDOW_HOURS = 12

_TAG_ALIAS_CACHE: dict[str, str] | None = None


def _load_tag_aliases() -> dict[str, str]:
    global _TAG_ALIAS_CACHE
    if _TAG_ALIAS_CACHE is not None:
        return _TAG_ALIAS_CACHE
    if not TAG_ALIASES_PATH.exists():
        _TAG_ALIAS_CACHE = {}
        return _TAG_ALIAS_CACHE
    raw = json.loads(TAG_ALIASES_PATH.read_text(encoding="utf-8"))
    mapping = raw.get("map") if isinstance(raw, dict) else {}
    if not isinstance(mapping, dict):
        mapping = {}
    # expand lookups: original, lower, compact
    table: dict[str, str] = {}
    for src, dst in mapping.items():
        if not isinstance(src, str) or not isinstance(dst, str):
            continue
        canon = dst.strip()
        if not canon:
            continue
        for key in (src, src.strip(), src.lower(), re.sub(r"[\s_\-]+", "", src.lower())):
            if key:
                table[key] = canon
        for key in (canon, canon.lower(), re.sub(r"[\s_\-]+", "", canon.lower())):
            if key:
                table[key] = canon
    _TAG_ALIAS_CACHE = table
    return table


def normalize_tag(tag: str) -> str:
    raw = str(tag or "").strip()
    if not raw:
        return raw
    table = _load_tag_aliases()
    for key in (raw, raw.lower(), re.sub(r"[\s_\-]+", "", raw.lower())):
        if key in table:
            return table[key]
    return raw


def normalize_tags(tags: Any) -> list[str]:
    if not isinstance(tags, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for t in tags:
        n = normalize_tag(str(t))
        if not n:
            continue
        # de-dupe by casefold to avoid OpenAI/openai duplicates
        k = n.casefold()
        if k in seen:
            continue
        seen.add(k)
        out.append(n)
    return out


def normalize_item_tags(item: dict[str, Any]) -> dict[str, Any]:
    if "tags" in item:
        item["tags"] = normalize_tags(item.get("tags"))
    return item

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
AI_RELEVANCE_SIGNAL = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"AI|xAI|LLMs?|GPT(?:-\d+(?:\.\d+)?)?|Claude|OpenAI|Anthropic|Gemini|Grok|"
    r"Agents?|Agentic|Codex|DeepSeek|Fable|Artifacts|opencode|Cursor|ChatGPT|"
    r"Hermes|Obsidian|NotebookLM|prompts?|Llama|Mistral"
    r")(?![A-Za-z0-9])|"
    r"(?:大模型|智能体|模型路由|生成式人工智能|人工智能|机器学习|深度学习|"
    r"多模态|提示词|推理模型|编程助手|黑客松)",
    re.I,
)

SCORE_DIMENSIONS = (
    "ai_relevance",
    "popularity",
    "engagement_rate",
    "information_density",
    "has_media",
)


@lru_cache(maxsize=8)
def _load_score_config(path: Path = SCORE_WEIGHTS_PATH) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot load score config: {path}: {exc}") from exc

    weights = config.get("weights")
    if not isinstance(weights, dict) or set(weights) != set(SCORE_DIMENSIONS):
        raise RuntimeError(
            "score config weights must contain exactly: "
            + ", ".join(SCORE_DIMENSIONS)
        )
    normalized_weights = {key: float(weights[key]) for key in SCORE_DIMENSIONS}
    if any(value < 0 for value in normalized_weights.values()):
        raise RuntimeError("score weights must be non-negative")
    if not math.isclose(sum(normalized_weights.values()), 1.0, abs_tol=1e-9):
        raise RuntimeError("score weights must sum to 1.0")

    normalization = config.get("normalization")
    if not isinstance(normalization, dict):
        raise RuntimeError("score config normalization must be an object")
    popularity_ceiling = float(normalization.get("popularity_log10_ceiling", 5.0))
    engagement_ceiling = float(normalization.get("engagement_rate_ceiling", 0.05))
    if popularity_ceiling <= 0 or engagement_ceiling <= 0:
        raise RuntimeError("score normalization ceilings must be positive")

    return {
        "weights": normalized_weights,
        "normalization": {
            "popularity_log10_ceiling": popularity_ceiling,
            "engagement_rate_ceiling": engagement_ceiling,
        },
    }


def _metric_number(value: Any) -> float:
    if value is None or isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return max(0.0, float(value))
    raw = str(value).strip().replace(",", "")
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)\s*([KMB]?)", raw, re.I)
    if not match:
        return 0.0
    multiplier = {
        "": 1.0,
        "K": 1_000.0,
        "M": 1_000_000.0,
        "B": 1_000_000_000.0,
    }[match.group(2).upper()]
    return float(match.group(1)) * multiplier


def _information_density(text: str) -> float:
    length = len(text.strip())
    if length <= 0:
        return 0.0
    if length < 80:
        return round(0.8 * math.sqrt(length / 80), 6)
    if length <= 600:
        return round(0.8 + 0.2 * ((length - 80) / 520), 6)
    # 长文不会因字数无限加分；超过理想区间后缓慢衰减。
    return round(max(0.35, 1.0 - 0.65 * math.log10(length / 600)), 6)


def score_tweet(
    tweet: dict[str, Any], config_path: Path = SCORE_WEIGHTS_PATH
) -> tuple[float, dict[str, float]]:
    """返回 0-100 分及归一化维度明细；无真实 AI 信号时硬归零。"""
    config = _load_score_config(config_path)
    text = str(tweet.get("text") or "").strip()
    likes = _metric_number(tweet.get("likes"))
    views = _metric_number(tweet.get("views"))
    normalization = config["normalization"]

    relevance = 1.0 if AI_RELEVANCE_SIGNAL.search(text) else 0.0
    popularity = min(
        1.0,
        math.log10(likes + 1)
        / normalization["popularity_log10_ceiling"],
    )
    engagement_rate = likes / views if views > 0 else 0.0
    engagement = min(
        1.0,
        engagement_rate / normalization["engagement_rate_ceiling"],
    )
    has_media = 1.0 if tweet.get("has_media") or tweet.get("media_urls") else 0.0
    breakdown = {
        "ai_relevance": relevance,
        "popularity": round(popularity, 6),
        "engagement_rate": round(engagement, 6),
        "information_density": _information_density(text),
        "has_media": has_media,
    }

    if relevance == 0:
        return 0.0, breakdown

    score = sum(
        config["weights"][dimension] * breakdown[dimension]
        for dimension in SCORE_DIMENSIONS
    )
    return round(score * 100, 3), breakdown


def resolve_slot(
    slot: str, now: datetime | None = None
) -> dict[str, str]:
    """解析场次 → 目标日与窗口（北京时间）。

    noon:     target=今天, window=今天 00:00–12:00
    midnight: target=昨天, window=昨天 12:00–24:00
    """
    slot = slot.strip().lower()
    if slot not in ("noon", "midnight"):
        raise ValueError("slot must be noon or midnight")
    now = now or datetime.now(SHANGHAI)
    if now.tzinfo is None:
        now = now.replace(tzinfo=SHANGHAI)
    else:
        now = now.astimezone(SHANGHAI)

    today = now.date()
    if slot == "noon":
        target = today
        window_start = datetime(today.year, today.month, today.day, 0, 0, tzinfo=SHANGHAI)
        window_end = datetime(today.year, today.month, today.day, 12, 0, tzinfo=SHANGHAI)
    else:
        target = today - timedelta(days=1)
        window_start = datetime(
            target.year, target.month, target.day, 12, 0, tzinfo=SHANGHAI
        )
        window_end = datetime(
            target.year, target.month, target.day, 0, 0, tzinfo=SHANGHAI
        ) + timedelta(days=1)

    target_s = target.isoformat()
    return {
        "SLOT": slot,
        "TARGET_DATE": target_s,
        "WINDOW_START": window_start.isoformat(),
        "WINDOW_END": window_end.isoformat(),
        "SINCE_DATE": window_start.astimezone(timezone.utc).date().isoformat(),
        "DAY_FILE": f"data/twitter/{target_s}.json",
    }


def mode_resolve_slot(args: argparse.Namespace) -> int:
    info = resolve_slot(args.slot)
    # shell-friendly exports
    for k, v in info.items():
        print(f"export {k}={v}")
    print(json.dumps(info, ensure_ascii=False), file=sys.stderr)
    return 0


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

    scored_passed = [(t, *score_tweet(t)) for t in passed]
    scored_passed.sort(
        key=lambda entry: (
            entry[1],
            _metric_number(entry[0].get("likes")),
            len(entry[0].get("text") or ""),
        ),
        reverse=True,
    )
    counts: dict[str, int] = {}
    candidates: list[dict[str, Any]] = []
    for t, score, score_breakdown in scored_passed:
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
                "score": score,
                "score_breakdown": score_breakdown,
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
        by_id[tid] = normalize_item_tags(dict(it))
        author_counts[a] = author_counts.get(a, 0) + 1
        added += 1

    merged = list(by_id.values())
    # also normalize tags on pre-existing items (keeps day file consistent)
    for it in merged:
        if isinstance(it, dict):
            normalize_item_tags(it)

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
    slot = (args.slot or "").strip().lower() or None
    day["selection"] = {
        "target_count": day_max,
        "max_count": day_max,
        "per_run_max": per_run_max,
        "min_count": None,
        "window_hours": WINDOW_HOURS,
        "runs_per_day": 2,
        "slot": slot,
        "target_date_rule": "noon→today; midnight→yesterday (Asia/Shanghai)",
        "merge": "append_dedupe_by_id",
        "actual_count": len(merged),
        "last_batch_added": added,
        "last_batch_skipped_dup": skipped_dup,
        "last_batch_skipped_author": skipped_author,
        "last_batch_skipped_day_cap": skipped_cap,
        "note": (
            f"双次采集/日；窗口{WINDOW_HOURS}h；"
            f"noon→当天文件，midnight→前一天文件；"
            f"每趟≤{per_run_max}；单日≤{day_max}不保底；追加按id去重。"
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


def mode_normalize_tags(args: argparse.Namespace) -> int:
    """回填：规范化 data/twitter/*.json 中的 tags。"""
    twitter_dir = Path(args.twitter_dir or "data/twitter")
    if not twitter_dir.exists():
        print(f"twitter dir missing: {twitter_dir}", file=sys.stderr)
        return 1
    files = sorted(twitter_dir.glob("*.json"))
    changed_files = 0
    items_touched = 0
    before_unique: set[str] = set()
    after_unique: set[str] = set()
    for path in files:
        day = json.loads(path.read_text(encoding="utf-8"))
        items = day.get("items") or []
        file_changed = False
        for it in items:
            if not isinstance(it, dict):
                continue
            old = list(it.get("tags") or [])
            for t in old:
                before_unique.add(str(t))
            normalize_item_tags(it)
            new = list(it.get("tags") or [])
            for t in new:
                after_unique.add(str(t))
            if old != new:
                file_changed = True
                items_touched += 1
        if file_changed:
            path.write_text(
                json.dumps(day, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            changed_files += 1
    print(
        json.dumps(
            {
                "twitter_dir": str(twitter_dir),
                "files_changed": changed_files,
                "items_touched": items_touched,
                "unique_tags_before": len(before_unique),
                "unique_tags_after": len(after_unique),
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
        choices=["hard-filter", "merge-day", "resolve-slot", "normalize-tags"],
    )
    ap.add_argument("--inputs", nargs="+", help="opencli JSON dumps (hard-filter)")
    ap.add_argument("--out", help="candidate pool output (hard-filter)")
    ap.add_argument("--max-per-author", type=int, default=MAX_PER_AUTHOR)
    ap.add_argument("--day-file", help="data/twitter/YYYY-MM-DD.json (merge-day)")
    ap.add_argument("--batch", help="batch items JSON (merge-day)")
    ap.add_argument("--date", help="YYYY-MM-DD (merge-day)")
    ap.add_argument(
        "--slot",
        choices=["noon", "midnight"],
        help="run slot: noon|midnight (resolve-slot / merge-day metadata)",
    )
    ap.add_argument("--per-run-max", type=int, default=PER_RUN_MAX)
    ap.add_argument("--day-max", type=int, default=DAY_MAX)
    ap.add_argument(
        "--twitter-dir",
        default="data/twitter",
        help="day JSON directory (normalize-tags)",
    )
    args = ap.parse_args()

    if args.mode == "resolve-slot":
        if not args.slot:
            print("resolve-slot needs --slot noon|midnight", file=sys.stderr)
            return 1
        return mode_resolve_slot(args)
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
    if args.mode == "normalize-tags":
        return mode_normalize_tags(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
