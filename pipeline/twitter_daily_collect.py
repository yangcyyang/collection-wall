#!/usr/bin/env python3
"""推特日报：硬规则初筛 + 本地候选池 + 单日 JSON 追加去重。

重要：
  title / summary / recommend_reason / tags **不得**由本脚本模板生成。
  hard-filter 产出持久候选池；pick 生成工作单；字段由 Agent 填写后，
  用 merge-day 并入日文件并回写候选状态。

节奏（2026-07-15，宪宪日期边界）：
  12:00 午场：窗口=当天 00:00–12:00（北京），写**当天**文件（新建/覆盖式首写）
  00:00 夜场：窗口=前一天 12:00–24:00（北京），**追加前一天**文件（禁止写新日历日）
  每趟工作单上限 20、单日安全阀 60（均不保底）；append + id 去重

短推契约：
  SHORT_TWEET_THRESHOLD = 200
  短推无 title；中文 summary=全文；英文 summary=完整中文翻译

用法：
  python3 pipeline/twitter_daily_collect.py --mode resolve-slot --slot noon|midnight
  python3 pipeline/twitter_daily_collect.py --mode hard-filter --inputs ... \\
    --date YYYY-MM-DD --slot noon
  python3 pipeline/twitter_daily_collect.py --mode pick \\
    --pool-file data/twitter/pool/YYYY-MM-DD-noon.json --inputs /tmp/raw.json \\
    --out /tmp/work.json
  python3 pipeline/twitter_daily_collect.py --mode merge-day \\
    --day-file data/twitter/YYYY-MM-DD.json --batch batch.json --date YYYY-MM-DD \\
    --slot noon --pool-file data/twitter/pool/YYYY-MM-DD-noon.json
  python3 pipeline/twitter_daily_collect.py --mode normalize-tags \\
    --twitter-dir data/twitter
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import tempfile
from functools import lru_cache
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

SHANGHAI = ZoneInfo("Asia/Shanghai")
ROOT = Path(__file__).resolve().parent
TAG_ALIASES_PATH = ROOT / "tag_aliases.json"
SCORE_WEIGHTS_PATH = ROOT / "score_weights.json"
POOL_ROOT = Path("data/twitter/pool")

MAX_PER_AUTHOR = 2
MIN_CANDIDATES = 5  # 12h 窗口略放宽「候选过少」门槛
SHORT_TWEET_THRESHOLD = 200
PER_RUN_MAX = 20
DAY_MAX = 60
WINDOW_HOURS = 12
POOL_LABEL_MAX_CHARS = 96
# Fields removed when publishing candidate items into public day files.
DAY_FILE_EXCLUDED_FIELDS = {
    "status",
    "score_breakdown",
    "label",
    "ref",
    "char_len",
    "is_short",
}

_TAG_ALIAS_CACHE: dict[str, str] | None = None


def write_json_atomically(path: Path, data: Any, *, compact: bool = False) -> None:
    """同目录临时文件落盘后替换目标，避免状态文件半写入。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            if compact:
                json.dump(data, temporary_file, ensure_ascii=False, separators=(",", ":"))
            else:
                json.dump(data, temporary_file, ensure_ascii=False, indent=2)
            temporary_file.write("\n")
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, path)
    except Exception:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
        raise


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
NON_AI_NEWS = re.compile(r"(旱稻|古城迎客|機動車|兩岸進出口|减脂餐|冷笑话)", re.I)
AI_WEAK_SIGNAL_PATTERN = (
    r"(?<![A-Za-z0-9])(?:AI|AIGC|AGI|LLMs?)(?![A-Za-z0-9])|"
    r"(?:生成式人工智能|人工智能|机器学习|深度学习|多模态|模型|推理)"
)
AI_STRONG_SIGNAL_PATTERN = (
    r"(?<![A-Za-z0-9])(?:"
    r"xAI|GPT(?:-?\d+(?:\.\d+)?)?|"
    r"ChatGPT(?:-?\d+(?:\.\d+)?)?|Claude(?:-?\d+(?:\.\d+)?)?|"
    r"Opus|Sonnet|Haiku|OpenAI|Anthropic|"
    r"Gemini|Grok|"
    r"Agents?|Agentic|Codex|DeepSeek|Fable|Artifacts|opencode|Cursor|"
    r"Hermes|Obsidian|NotebookLM|prompts?|Llama|Mistral|RAG|TTS|"
    r"Qwen(?:-[A-Za-z0-9]+(?:\.[0-9]+)*)*"
    r")(?![A-Za-z0-9])|"
    r"(?:"
    r"大模型|智能体|模型路由|提示词|推理模型|编程助手|黑客松|微调|开源模型|"
    r"通义|千问|豆包|文心|混元|语音模型|多模态模型"
    r")"
)
# 硬筛门卫与打分器必须使用同一份词源；否则新模型名会在入池前被漏掉。
AI_SIGNAL_PATTERN = f"(?:{AI_WEAK_SIGNAL_PATTERN})|(?:{AI_STRONG_SIGNAL_PATTERN})"
AI_SIGNAL = re.compile(AI_SIGNAL_PATTERN, re.I)
AI_RELEVANCE_SIGNAL = AI_SIGNAL
AI_STRONG_SIGNAL = re.compile(AI_STRONG_SIGNAL_PATTERN, re.I)

SCORE_DIMENSIONS = (
    "ai_relevance",
    "popularity",
    "engagement_rate",
    "information_density",
    "has_media",
)

# 当前按场次启动独立 CLI 进程，缓存仅覆盖单次运行；若迁入长驻服务，
# 必须改用 mtime 失效或显式清缓存，避免热改 score_weights.json 未生效。
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


def _ai_relevance(text: str) -> float:
    """门卫与打分器共用信号，强信号优先于泛 AI 提及。"""
    if AI_STRONG_SIGNAL.search(text):
        return 1.0
    if AI_SIGNAL.search(text):
        return 0.5
    return 0.0


def score_tweet(
    tweet: dict[str, Any], config_path: Path = SCORE_WEIGHTS_PATH
) -> tuple[float, dict[str, float]]:
    """返回 0-100 分及归一化维度明细；无真实 AI 信号时硬归零。"""
    config = _load_score_config(config_path)
    text = str(tweet.get("text") or "").strip()
    likes = _metric_number(tweet.get("likes"))
    views = _metric_number(tweet.get("views"))
    normalization = config["normalization"]

    relevance = _ai_relevance(text)
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


def default_pool_path(date: str, slot: str) -> Path:
    """返回一个场次的可追溯候选池路径。"""
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except (TypeError, ValueError) as exc:
        raise ValueError("date must be YYYY-MM-DD") from exc
    normalized_slot = str(slot or "").strip().lower()
    if normalized_slot not in ("noon", "midnight"):
        raise ValueError("slot must be noon or midnight")
    return POOL_ROOT / f"{date}-{normalized_slot}.json"


def _pool_label(text: str) -> str:
    """生成可审计但不保存全文的单行标题。"""
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= POOL_LABEL_MAX_CHARS:
        return normalized
    return normalized[:POOL_LABEL_MAX_CHARS].rstrip() + "…"


def _source_ref(tweet_id: str, url: Any) -> str:
    """优先引用原推 URL；缺失时使用稳定的 X 状态页。"""
    normalized_url = str(url or "").strip()
    return normalized_url or f"https://x.com/i/web/status/{tweet_id}"


def _published_ref(date: Any, tweet_id: str) -> str:
    """引用成品日文件；fragment 让人工和脚本都能按 id 定位。"""
    normalized_date = str(date or "").strip()
    if not normalized_date:
        return tweet_id
    return f"data/twitter/{normalized_date}.json#{tweet_id}"


def _write_pool(path: Path, pool: dict[str, Any]) -> None:
    """候选池会进入 Git，使用紧凑 JSON 避免重复缩进体积。"""
    write_json_atomically(path, pool, compact=True)


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
    out_path = Path(args.out)
    published_ids: set[str] = set()
    if out_path.exists():
        try:
            previous = json.loads(out_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"invalid existing pool JSON: {out_path}: {exc}", file=sys.stderr)
            return 1
        previous_candidates = (
            previous.get("candidates") if isinstance(previous, dict) else None
        )
        if isinstance(previous_candidates, list):
            published_ids = {
                str(item.get("id"))
                for item in previous_candidates
                if isinstance(item, dict)
                and item.get("id")
                and item.get("status") == "published"
            }

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
    candidates: list[dict[str, Any]] = []
    for t, score, score_breakdown in scored_passed:
        tweet_id = str(t.get("id"))
        text = (t.get("text") or "").strip()
        published = tweet_id in published_ids
        candidates.append(
            {
                "id": tweet_id,
                "author": t.get("author"),
                "label": _pool_label(text),
                "ref": (
                    _published_ref(getattr(args, "date", None), tweet_id)
                    if published
                    else _source_ref(tweet_id, t.get("url"))
                ),
                "score": score,
                "score_breakdown": [
                    score_breakdown[dimension] for dimension in SCORE_DIMENSIONS
                ],
                "status": "published" if published else "pending",
            }
        )

    out = {
        "schema_version": 3,
        "date": getattr(args, "date", None),
        "slot": getattr(args, "slot", None),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_count": len(pool),
        "score_dimensions": list(SCORE_DIMENSIONS),
        "candidates": candidates,
        "rejected": rejected,
    }
    _write_pool(out_path, out)
    print(
        json.dumps(
            {
                "pool": len(pool),
                "pool_file": str(out_path),
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


def mode_pick(args: argparse.Namespace) -> int:
    """从持久候选池生成 Agent 工作单；作者上限只在这里生效。"""
    pool_path = Path(args.pool_file)
    if not pool_path.exists():
        print(f"pool missing: {pool_path}", file=sys.stderr)
        return 1
    try:
        pool = json.loads(pool_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"invalid pool JSON: {pool_path}: {exc}", file=sys.stderr)
        return 1
    candidates = pool.get("candidates") if isinstance(pool, dict) else None
    if not isinstance(candidates, list):
        print("pool must be an object with candidates:[]", file=sys.stderr)
        return 1
    score_dimensions = pool.get("score_dimensions")
    if score_dimensions != list(SCORE_DIMENSIONS):
        print(
            "pool score_dimensions must match the current scoring dimensions",
            file=sys.stderr,
        )
        return 1

    eligible = [
        item
        for item in candidates
        if isinstance(item, dict)
        and item.get("id")
        and str(item.get("status") or "pending") == "pending"
        and _metric_number(item.get("score")) > 0
    ]
    eligible.sort(
        key=lambda item: _metric_number(item.get("score")),
        reverse=True,
    )

    top_n = max(0, int(args.top_n))
    max_per_author = max(1, int(args.max_per_author))
    author_counts: dict[str, int] = {}
    picked_audit: list[dict[str, Any]] = []
    for item in eligible:
        if len(picked_audit) >= top_n:
            break
        author = str(item.get("author") or "unknown").casefold()
        if author_counts.get(author, 0) >= max_per_author:
            continue
        picked_audit.append(item)
        author_counts[author] = author_counts.get(author, 0) + 1

    source_by_id: dict[str, dict[str, Any]] = {}
    for source_name in getattr(args, "inputs", None) or []:
        source_path = Path(source_name)
        if not source_path.exists():
            print(f"WARN missing {source_path}", file=sys.stderr)
            continue
        for tweet in load_json_tweets(source_path):
            tweet_id = str(tweet.get("id") or "")
            if tweet_id:
                source_by_id[tweet_id] = tweet

    missing_ids = [
        str(item.get("id"))
        for item in picked_audit
        if str(item.get("id")) not in source_by_id
    ]
    if missing_ids:
        print(
            "pick cannot hydrate full text; pass the original --inputs for ids: "
            + ", ".join(missing_ids),
            file=sys.stderr,
        )
        return 1

    picked: list[dict[str, Any]] = []
    for audit_item in picked_audit:
        tweet_id = str(audit_item.get("id"))
        breakdown_values = audit_item.get("score_breakdown")
        if not isinstance(breakdown_values, list) or len(breakdown_values) != len(
            score_dimensions
        ):
            print(
                f"pool score_breakdown is invalid for id: {tweet_id}",
                file=sys.stderr,
            )
            return 1
        work_item = dict(source_by_id[tweet_id])
        work_item["score"] = audit_item.get("score")
        work_item["score_breakdown"] = dict(
            zip(score_dimensions, breakdown_values, strict=True)
        )
        work_item["status"] = audit_item.get("status")
        picked.append(work_item)

    out = {
        "schema_version": 1,
        "mode": "pick",
        "date": getattr(args, "date", None) or pool.get("date"),
        "slot": getattr(args, "slot", None) or pool.get("slot"),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_pool": str(pool_path),
        "top_n": top_n,
        "max_per_author": max_per_author,
        "eligible_count": len(eligible),
        "picked_count": len(picked),
        "items": picked,
    }
    out_path = Path(args.out)
    write_json_atomically(out_path, out)
    print(
        json.dumps(
            {
                "pool_file": str(pool_path),
                "work_file": str(out_path),
                "eligible": len(eligible),
                "picked": len(picked),
                "top_n": top_n,
                "max_per_author": max_per_author,
            },
            ensure_ascii=False,
        )
    )
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
    """把本批已填字段追加进日文件，并把对应池条目标为已发布。"""
    day_path = Path(args.day_file)
    batch_path = Path(args.batch)
    if not batch_path.exists():
        print(f"batch missing: {batch_path}", file=sys.stderr)
        return 1

    pool_path: Path | None = None
    pool_data: dict[str, Any] | None = None
    explicit_pool = getattr(args, "pool_file", None)
    if explicit_pool:
        pool_path = Path(explicit_pool)
        if not pool_path.exists():
            print(f"pool missing: {pool_path}", file=sys.stderr)
            return 1
    elif getattr(args, "date", None) and getattr(args, "slot", None):
        candidate_path = default_pool_path(args.date, args.slot)
        if candidate_path.exists():
            pool_path = candidate_path
    if pool_path is not None:
        try:
            loaded_pool = json.loads(pool_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"invalid pool JSON: {pool_path}: {exc}", file=sys.stderr)
            return 1
        if not isinstance(loaded_pool, dict) or not isinstance(
            loaded_pool.get("candidates"), list
        ):
            print("pool must be an object with candidates:[]", file=sys.stderr)
            return 1
        pool_data = loaded_pool

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
        a = str(it.get("author") or "unknown").casefold()
        author_counts[a] = author_counts.get(a, 0) + 1

    added = 0
    skipped_dup = 0
    skipped_author = 0
    skipped_cap = 0
    published_ids: set[str] = set()
    for it in batch_items:
        tid = str(it.get("id"))
        if tid in by_id:
            skipped_dup += 1
            published_ids.add(tid)
            continue
        if len(by_id) >= day_max:
            skipped_cap += 1
            continue
        a = str(it.get("author") or "unknown").casefold()
        if author_counts.get(a, 0) >= MAX_PER_AUTHOR:
            skipped_author += 1
            continue
        day_item = {
            key: value
            for key, value in it.items()
            if key not in DAY_FILE_EXCLUDED_FIELDS
        }
        by_id[tid] = normalize_item_tags(day_item)
        author_counts[a] = author_counts.get(a, 0) + 1
        published_ids.add(tid)
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

    write_json_atomically(day_path, day)

    pool_published = 0
    if pool_data is not None and pool_path is not None:
        for item in pool_data["candidates"]:
            if not isinstance(item, dict):
                continue
            if str(item.get("id") or "") not in published_ids:
                continue
            item["ref"] = _published_ref(args.date, str(item.get("id")))
            if item.get("status") != "published":
                item["status"] = "published"
                pool_published += 1
        _write_pool(pool_path, pool_data)

    print(
        json.dumps(
            {
                "day_file": str(day_path),
                "actual_count": len(merged),
                "added": added,
                "skipped_dup": skipped_dup,
                "skipped_author": skipped_author,
                "skipped_day_cap": skipped_cap,
                "pool_file": str(pool_path) if pool_path else None,
                "pool_published": pool_published,
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
            write_json_atomically(path, day)
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
        choices=[
            "hard-filter",
            "pick",
            "merge-day",
            "resolve-slot",
            "normalize-tags",
        ],
    )
    ap.add_argument("--inputs", nargs="+", help="opencli JSON dumps (hard-filter)")
    ap.add_argument("--out", help="output JSON (hard-filter / pick)")
    ap.add_argument(
        "--pool-file",
        help="persistent candidate pool (pick / merge-day status writeback)",
    )
    ap.add_argument(
        "--top-n",
        type=int,
        default=PER_RUN_MAX,
        help="work-order size (pick)",
    )
    ap.add_argument(
        "--max-per-author",
        type=int,
        default=MAX_PER_AUTHOR,
        help="same-author limit (pick)",
    )
    ap.add_argument("--day-file", help="data/twitter/YYYY-MM-DD.json (merge-day)")
    ap.add_argument("--batch", help="batch items JSON (merge-day)")
    ap.add_argument("--date", help="YYYY-MM-DD (hard-filter / pick / merge-day)")
    ap.add_argument(
        "--slot",
        choices=["noon", "midnight"],
        help="run slot: noon|midnight",
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
        if not args.inputs:
            print("hard-filter needs --inputs", file=sys.stderr)
            return 1
        if not args.out:
            if not args.date or not args.slot:
                print(
                    "hard-filter needs --out or both --date and --slot",
                    file=sys.stderr,
                )
                return 1
            args.out = str(default_pool_path(args.date, args.slot))
        return mode_hard_filter(args)
    if args.mode == "pick":
        if not args.pool_file:
            if not args.date or not args.slot:
                print(
                    "pick needs --pool-file or both --date and --slot",
                    file=sys.stderr,
                )
                return 1
            args.pool_file = str(default_pool_path(args.date, args.slot))
        if not args.out:
            print("pick needs --out", file=sys.stderr)
            return 1
        return mode_pick(args)
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
