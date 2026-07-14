#!/usr/bin/env python3
"""推特日报：opencli JSON → 硬规则筛选 → data/twitter/YYYY-MM-DD.json

对齐 site/src/lib/twitter.ts（6052e3a + b0b1359）：
- title: 中文一句话；text≤80 不写 title
- summary / tags / recommend_reason（人话）由本脚本生成
- created_at: ISO 8601 UTC
- 不写 avatar

exit 0 写盘；exit 2 缺刊不写；exit 1 参数错误
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

MIN_ITEMS = 20
TARGET_ITEMS = 30
MAX_PER_AUTHOR = 2
SHORT_TWEET_THRESHOLD = 80

AI_KW = re.compile(
    r"\b(AI|LLM|GPT|Claude|OpenAI|Anthropic|Gemini|Grok|Agent|RAG|"
    r"fine-?tun|model|diffusion|transformer|prompt|Codex|Copilot|"
    r"DeepSeek|Qwen|Mistral|Sora|Midjourney|Runway|Cursor)\b|"
    r"大模型|智能体|生成式|多模态|推理|agent|模型|提示词",
    re.I,
)
PRODUCT_KW = re.compile(
    r"\b(product|launch|ship|MVP|PMF|startup|SaaS|pricing|release|"
    r"changelog|design|UX|workflow|automation|API)\b|"
    r"产品|发布|上线|定价|工作流|开源|迭代",
    re.I,
)
PROMO_KW = re.compile(
    r"(FREE\b|MILLIONAIRE|BLUEPRINT|午夜|MIDNIGHT|ONLY\s*\$|订阅捆绑|"
    r"STOP PAYING|FIRST\s*5\s*ONLY|GONE AT|限时免费|"
    r"7-FIGURE|7 FIGURE|money blueprint|点链接领取|扫码加群)",
    re.I,
)
LIFESTYLE_NOISE = re.compile(
    r"(tan lines|good morning\b|\bgm\b|我的身体|bike to work|"
    r"今天吃了|打卡健身|恋爱|擦边)",
    re.I,
)
CN_CHAR = re.compile(r"[\u4e00-\u9fff]")


def load_json_tweets(path: Path) -> list[dict[str, Any]]:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    starts = [i for i in (raw.find("["), raw.find("{")) if i >= 0]
    if not starts:
        return []
    data = json.loads(raw[min(starts) :])
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("data", "tweets", "results", "items"):
            v = data.get(k)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
        return [data]
    return []


def parse_time(s: str | None) -> datetime | None:
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


def to_iso_utc(s: str | None) -> str | None:
    dt = parse_time(s)
    if not dt:
        return None
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_chinese_heavy(text: str) -> bool:
    if not text:
        return False
    cn = len(CN_CHAR.findall(text))
    return cn >= 8 and cn / max(len(text), 1) >= 0.15


def hard_reject(t: dict[str, Any]) -> str | None:
    text = (t.get("text") or t.get("summary") or "").strip()
    if not text:
        return "empty"
    if PROMO_KW.search(text):
        return "promo"
    if LIFESTYLE_NOISE.search(text) and not AI_KW.search(text):
        return "lifestyle"
    if (
        not AI_KW.search(text)
        and not PRODUCT_KW.search(text)
        and not is_chinese_heavy(text)
        and len(text) < 40
        and int(t.get("likes") or 0) > 500
    ):
        return "hot-meme"
    if text.startswith("@") and len(text) < 60 and not AI_KW.search(text):
        return "short-reply"
    return None


def score_tweet(t: dict[str, Any], now: datetime) -> float:
    text = t.get("text") or t.get("summary") or ""
    bio = t.get("bio") or t.get("author_bio") or ""
    likes = int(t.get("likes") or 0)
    try:
        views = int(str(t.get("views") or "0").replace(",", ""))
    except ValueError:
        views = 0

    s = 0.0
    if AI_KW.search(text):
        s += 5.0
    if AI_KW.search(bio):
        s += 1.2
    if PRODUCT_KW.search(text):
        s += 2.0
    if is_chinese_heavy(text) and (AI_KW.search(text) or PRODUCT_KW.search(text)):
        s += 3.0
    if text.startswith("@"):
        s -= 1.5
    s += min(likes, 200) / 25.0
    s += min(math.log10(views + 1), 3.5)
    if len(text) >= 80:
        s += 1.0
    if len(text) >= 160:
        s += 0.5
    if t.get("has_media"):
        s += 0.3

    dt = parse_time(t.get("created_at"))
    if dt:
        age_h = (now - dt.astimezone(timezone.utc)).total_seconds() / 3600
        if age_h <= 24:
            s += 1.0
        elif age_h <= 36:
            s += 0.2
        else:
            s -= 2.5
    return s


def infer_tags(t: dict[str, Any]) -> list[str]:
    text = " ".join(
        [
            str(t.get("text") or ""),
            str(t.get("summary") or ""),
            str(t.get("bio") or t.get("author_bio") or ""),
            str(t.get("author") or ""),
        ]
    )
    tags: list[str] = []
    mapping = [
        (r"Anthropic|Claude", "Anthropic"),
        (r"OpenAI|GPT|Codex|ChatGPT|\bsama\b", "OpenAI"),
        (r"Google|DeepMind|Gemini|Antigravity", "Google"),
        (r"Grok|xAI", "xAI"),
        (r"NVIDIA|GTC|Rubin|CUDA", "NVIDIA"),
        (r"\bAzure\b|Microsoft", "Microsoft"),
        (r"Agent|智能体|agentic", "Agent"),
        (r"研究|research|paper|values", "研究"),
        (r"产品|launch|发布|ship|pricing", "产品"),
        (r"设计|UI|UX|design|web design", "设计"),
        (r"开源|open.?source", "开源"),
        (r"安全|jailbreak|biosafety", "安全"),
        (r"硬件|chip|封装|机柜", "硬件"),
    ]
    for pat, tag in mapping:
        if re.search(pat, text, re.I) and tag not in tags:
            tags.append(tag)
    if not tags and AI_KW.search(text):
        tags.append("AI")
    return tags[:5]


def make_title(text: str) -> str | None:
    """长推生成中文一句话标题；≤80 字返回 None（前端直接露原文）。"""
    clean = text.strip().replace("\n", " ")
    if len(clean) <= SHORT_TWEET_THRESHOLD:
        return None
    # 中文正文：取第一句或前 28 字
    if is_chinese_heavy(clean):
        for sep in ("。", "！", "？", "；", ". ", "! ", "? "):
            if sep in clean[:60]:
                head = clean.split(sep, 1)[0].strip()
                if 6 <= len(head) <= 36:
                    return head
        return clean[:28].rstrip() + ("…" if len(clean) > 28 else "")
    # 英文：压缩成中文总概（基于关键词，非机翻全文）
    tags_hint = []
    if re.search(r"Claude|Anthropic", clean, re.I):
        tags_hint.append("Claude/Anthropic")
    if re.search(r"OpenAI|GPT|Codex|ChatGPT", clean, re.I):
        tags_hint.append("OpenAI")
    if re.search(r"agent", clean, re.I):
        tags_hint.append("Agent")
    if re.search(r"research|paper|we found|we asked", clean, re.I):
        tags_hint.append("研究")
    if re.search(r"launch|release|ship|pricing|import is now", clean, re.I):
        tags_hint.append("发布")
    if re.search(r"design", clean, re.I):
        tags_hint.append("设计")
    topic = "、".join(tags_hint[:2]) if tags_hint else "AI 动态"
    # 取前若干词作线索
    snippet = re.sub(r"https?://\S+", "", clean)
    snippet = re.sub(r"\s+", " ", snippet).strip()
    if len(snippet) > 42:
        snippet = snippet[:40].rstrip() + "…"
    return f"{topic}：{snippet}"


def human_reason(t: dict[str, Any]) -> str:
    text = (t.get("text") or "").strip().replace("\n", " ")
    author = t.get("author") or "作者"
    tags = infer_tags(t)
    if is_chinese_heavy(text):
        if "产品" in tags or PRODUCT_KW.search(text):
            return f"@{author} 这条中文实践可直接借鉴，讲的是产品/工作流怎么落地。"
        return f"@{author} 的中文讨论信息密度够，适合扫一眼跟进。"
    if "研究" in tags or re.search(r"research|paper|we (found|asked|analyzed)", text, re.I):
        return f"@{author} 放出研究/实验结论，建议点开看原文细节。"
    if "Agent" in tags or re.search(r"agentic|\bagents?\b", text, re.I):
        return f"@{author} 在谈 Agent 规模化或落地成本，和日常工具链相关。"
    if "产品" in tags or PRODUCT_KW.search(text):
        return f"@{author} 带来产品或能力更新信号，可决定要不要试用。"
    if "设计" in tags:
        return f"@{author} 展示了可参考的设计/交互方向。"
    if "安全" in tags:
        return f"@{author} 的安全/红队信息值得收藏对照。"
    if AI_KW.search(text):
        return f"@{author} 这条是关注流里有增量的 AI 信号。"
    return f"@{author} 在关注流里信息密度尚可，值得点开确认。"


def summary_of(text: str) -> str:
    clean = text.strip().replace("\n", " ")
    if len(clean) <= 180:
        return clean
    return clean[:177] + "…"


def normalize_item(rank: int, t: dict[str, Any], sc: float) -> dict[str, Any]:
    text = (t.get("text") or t.get("summary") or "").strip()
    created = to_iso_utc(t.get("created_at")) or datetime.now(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    try:
        likes_n = int(t.get("likes") or 0)
    except (TypeError, ValueError):
        likes_n = 0
    item: dict[str, Any] = {
        "rank": rank,
        "id": str(t.get("id") or ""),
        "author": t.get("author"),
        "author_bio": (t.get("bio") or t.get("author_bio") or "")[:160],
        "text": text,
        "summary": summary_of(text),
        "url": t.get("url") or f"https://x.com/i/status/{t.get('id')}",
        "created_at": created,
        "likes": likes_n,
        "views": str(t.get("views") if t.get("views") is not None else "0"),
        "has_media": bool(t.get("has_media")),
        "media_urls": t.get("media_urls") or [],
        "score": round(float(sc), 2),
        "recommend_reason": human_reason(t),
        "tags": infer_tags(t),
    }
    title = make_title(text)
    if title:
        item["title"] = title
    return item


def select_items(
    pool: list[dict[str, Any]], now: datetime
) -> tuple[list[tuple[float, dict[str, Any]]], dict[str, int]]:
    rejected: dict[str, int] = {}
    scored: list[tuple[float, dict[str, Any]]] = []
    for t in pool:
        why = hard_reject(t)
        if why:
            rejected[why] = rejected.get(why, 0) + 1
            continue
        dt = parse_time(t.get("created_at"))
        if dt and dt.astimezone(timezone.utc) < now - timedelta(hours=36):
            rejected["too_old"] = rejected.get("too_old", 0) + 1
            continue
        scored.append((score_tweet(t, now), t))
    scored.sort(key=lambda x: x[0], reverse=True)

    picked: list[tuple[float, dict[str, Any]]] = []
    counts: dict[str, int] = {}
    for sc, t in scored:
        author = str(t.get("author") or "unknown")
        if counts.get(author, 0) >= MAX_PER_AUTHOR:
            rejected["author_cap"] = rejected.get("author_cap", 0) + 1
            continue
        picked.append((sc, t))
        counts[author] = counts.get(author, 0) + 1
        if len(picked) >= TARGET_ITEMS:
            break
    return picked, rejected


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", nargs="+", required=True)
    ap.add_argument("--date", required=True)
    ap.add_argument("--out-dir", default="data/twitter")
    ap.add_argument("--account", default="yangcyyang1")
    args = ap.parse_args()

    pool_by_id: dict[str, dict[str, Any]] = {}
    for p in args.inputs:
        path = Path(p)
        if not path.exists():
            print(f"WARN missing input: {path}", file=sys.stderr)
            continue
        for t in load_json_tweets(path):
            tid = str(t.get("id") or t.get("url") or "")
            if tid:
                pool_by_id[tid] = t

    pool = list(pool_by_id.values())
    now = datetime.now(timezone.utc)
    picked, rejected = select_items(pool, now)
    print(json.dumps({"pool": len(pool), "picked": len(picked), "rejected": rejected}, ensure_ascii=False))

    if len(picked) < MIN_ITEMS:
        print(f"缺刊：仅 {len(picked)} 条（需≥{MIN_ITEMS}）。原因={rejected}", file=sys.stderr)
        return 2

    items = [normalize_item(i, t, sc) for i, (sc, t) in enumerate(picked, 1)]
    doc = {
        "schema_version": 1,
        "date": args.date,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": {
            "type": "following_timeline",
            "method": "opencli twitter search filter:follows",
            "account": args.account,
            "window_hours": 24,
        },
        "items": items,
    }
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{args.date}.json"
    out_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {out_path} count={len(items)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
