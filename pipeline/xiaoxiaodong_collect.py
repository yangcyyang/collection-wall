#!/usr/bin/env python3
"""@xiaoxiaodong01 提示词墙：按周回填 OpenCLI 窗口，ingest 进 PromptSource JSON。

成品真相源：data/prompts/xiaoxiaodong01.json
站点原样读取（site/src/lib/prompts.ts），本脚本不改前端、不改 schema。
每条只保留 {id, author, url, created_at, text, prompt, images:[{url, poster?}]}。
提示词原文照录，禁止改写。

本脚本只包装本机已登录的 OpenCLI（默认 ~/.local/bin/opencli，@yangcyyang1）。
不登录、不动 cookie、不直连 X、不用 Gmail/X MCP。Cloud VM 没有该会话，
不要在云上跑 pull/run。

429 立刻以非 0 退出并打印 JSON：
  {"rate_limited": true, "window": {"since": "...", "until": "..."}, "attempt": N}
不要在脚本里 sleep 一小时。第一次 / 第二次 429、以及「同一上海日停手」
由调用方 / 例行任务负责。

用法（在已登录 OpenCLI 的机器上跑一个回填窗口）：

  python3 pipeline/xiaoxiaodong_collect.py --mode resolve-coverage
  # 下一窗从文件最早 created_at 往前推 window_days（默认 7，until 为 Twitter 排除日）
  # 当前墙最早约 2026-05-25 → 默认下一窗 since:2026-05-18 until:2026-05-25
  # 再往前直到 --horizon（默认 2026-01-01）

  python3 pipeline/xiaoxiaodong_collect.py --mode pull \\
    --since 2026-05-11 --until 2026-05-18 --out /tmp/xxd-raw.json

  python3 pipeline/xiaoxiaodong_collect.py --mode ingest \\
    --raw /tmp/xxd-raw.json --source data/prompts/xiaoxiaodong01.json

  python3 pipeline/xiaoxiaodong_collect.py --mode run \\
    --since 2026-05-11 --until 2026-05-18
  # 省略 since/until 时使用 resolve-coverage 的 next_window
  # --windows 2026-05-11:2026-05-18,2026-05-04:2026-05-11
  #   多窗时每窗一次 OpenCLI；任一 429 立即停，不继续后面的窗

  python3 pipeline/xiaoxiaodong_collect.py --mode pull --since ... --until ... --dry-run
  # 只打印 argv，不访问网络

OpenCLI（仓库内日报 SOP 同款；search 本身带 media 字段）：

  opencli twitter search \\
    "from:xiaoxiaodong01 -filter:replies since:DATE until:DATE" \\
    --product live --limit 80 -f json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

AUTHOR = "xiaoxiaodong01"
DEFAULT_SOURCE = Path("data/prompts/xiaoxiaodong01.json")
DEFAULT_TITLE = "xiaoxiaodong01 提示词"
DEFAULT_WINDOW_DAYS = 7
DEFAULT_HORIZON = date(2026, 1, 1)
DEFAULT_LIMIT = 80
DEFAULT_OPENCLI = Path.home() / ".local/bin/opencli"
MIN_PROMPT_CHARS = 40
RATE_LIMIT_EXIT = 3

ITEM_FIELDS = ("id", "author", "url", "created_at", "text", "prompt", "images")
RATE_LIMIT_RE = re.compile(r"\b429\b|rate[-_ ]limit(?:ed)?|too many requests", re.I)
IMAGE_EXT_RE = re.compile(r"\.(?:jpe?g|png|webp|gif)(?:$|\?)", re.I)
FENCE_RE = re.compile(r"```[^\n`]*\n(.*?)```", re.S)
BLOCK_LABEL_RE = re.compile(
    r"(?im)^(?:#{1,6}\s+)?(?:"
    r"完整提示词如下|如下是完整提示词|如下提示词|汤底提示词如下|"
    r"最后一组的提示词|优化版提示词|完整提示词|prompt"
    r")\s*[：:]?\s*$"
)
INLINE_LABEL_RE = re.compile(
    r"(?im)^(?:#{1,6}\s+)?(?:"
    r"完整提示词如下|如下是完整提示词|如下提示词|汤底提示词如下|"
    r"最后一组的提示词|优化版提示词|完整提示词|prompt"
    r")\s*[：:]\s+(\S[\s\S]+)$"
)


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


def write_text_atomically(path: Path, text: str) -> None:
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
            temporary_file.write(text)
            if not text.endswith("\n"):
                temporary_file.write("\n")
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, path)
    except Exception:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
        raise


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    try:
        if raw.endswith("Z"):
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if "T" in raw:
            return datetime.fromisoformat(raw)
    except ValueError:
        pass
    try:
        return datetime.strptime(raw, "%a %b %d %H:%M:%S %z %Y")
    except ValueError:
        return None


def parse_iso_date(value: str, flag: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{flag} must be YYYY-MM-DD") from exc


def normalize_created_at(value: str | None) -> str:
    parsed = parse_time(value)
    if parsed is None:
        return (value or "").strip()
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.isoformat()


def extract_prompt(text: str) -> str | None:
    """从推文抽取提示词：代码围栏优先，否则明确的提示词/prompt 块。原文照录。"""
    body = text or ""
    fences = [block.strip("\n") for block in FENCE_RE.findall(body)]
    fences = [block for block in fences if len(block.strip()) >= MIN_PROMPT_CHARS]
    if fences:
        return max(fences, key=lambda block: len(block.strip()))

    inline = INLINE_LABEL_RE.search(body)
    if inline:
        candidate = inline.group(1).strip()
        if len(candidate) >= MIN_PROMPT_CHARS:
            return candidate

    lines = body.splitlines()
    for index, line in enumerate(lines):
        if not BLOCK_LABEL_RE.match(line.strip()):
            continue
        candidate = "\n".join(lines[index + 1 :]).strip()
        if len(candidate) >= MIN_PROMPT_CHARS:
            return candidate
    return None


def load_json_tweets(path: Path) -> list[dict[str, Any]]:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    if not raw.strip():
        return []
    starts = [index for index in (raw.find("["), raw.find("{")) if index >= 0]
    if not starts:
        return []
    data = json.loads(raw[min(starts) :])
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in ("data", "tweets", "results", "items"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def tweet_id(tweet: dict[str, Any]) -> str:
    return str(tweet.get("id") or tweet.get("id_str") or "").strip()


def tweet_author(tweet: dict[str, Any]) -> str:
    author = tweet.get("author") or tweet.get("username") or tweet.get("user")
    if isinstance(author, dict):
        author = author.get("username") or author.get("screen_name") or AUTHOR
    name = str(author or AUTHOR).strip().lstrip("@")
    return name or AUTHOR


def tweet_url(tweet: dict[str, Any], tid: str) -> str:
    url = str(tweet.get("url") or "").strip()
    return url or f"https://x.com/i/status/{tid}"


def tweet_text(tweet: dict[str, Any]) -> str:
    return str(tweet.get("text") or tweet.get("full_text") or "")


def is_image_url(url: str) -> bool:
    if not url.startswith("http"):
        return False
    lowered = url.lower()
    if "video.twimg.com" in lowered or lowered.endswith(".mp4"):
        return False
    if "pbs.twimg.com/media" in lowered:
        return True
    return bool(IMAGE_EXT_RE.search(url))


def _collect_url_pairs(tweet: dict[str, Any]) -> list[tuple[str, str | None]]:
    pairs: list[tuple[str, str | None]] = []
    media_urls = tweet.get("media_urls") or []
    posters = tweet.get("media_posters") or []
    if isinstance(media_urls, list):
        for index, url in enumerate(media_urls):
            if not isinstance(url, str):
                continue
            poster = posters[index] if isinstance(posters, list) and index < len(posters) else None
            pairs.append((url, poster if isinstance(poster, str) else None))
    for key in ("images", "photos", "media"):
        blob = tweet.get(key)
        if not isinstance(blob, list):
            continue
        for item in blob:
            if isinstance(item, str):
                pairs.append((item, None))
                continue
            if not isinstance(item, dict):
                continue
            url = item.get("url") or item.get("media_url_https") or item.get("media_url")
            poster = item.get("poster") or item.get("preview_image_url")
            if isinstance(url, str):
                pairs.append((url, poster if isinstance(poster, str) else None))
    entities = tweet.get("extended_entities") or tweet.get("entities") or {}
    if isinstance(entities, dict):
        media = entities.get("media")
        if isinstance(media, list):
            for item in media:
                if not isinstance(item, dict):
                    continue
                url = item.get("media_url_https") or item.get("media_url") or item.get("url")
                if isinstance(url, str):
                    pairs.append((url, None))
    return pairs


def extract_images(tweet: dict[str, Any]) -> list[dict[str, str]]:
    images: list[dict[str, str]] = []
    seen: set[str] = set()
    for url, poster in _collect_url_pairs(tweet):
        url = url.strip()
        if not is_image_url(url) or url in seen:
            continue
        seen.add(url)
        image = {"url": url, "poster": (poster or url).strip() or url}
        images.append(image)
    return images


def prompt_item_from_tweet(tweet: dict[str, Any]) -> dict[str, Any] | None:
    tid = tweet_id(tweet)
    if not tid:
        return None
    images = extract_images(tweet)
    if not images:
        return None
    text = tweet_text(tweet)
    prompt = extract_prompt(text)
    if not prompt:
        return None
    created = normalize_created_at(str(tweet.get("created_at") or ""))
    if not created:
        return None
    return {
        "id": tid,
        "author": tweet_author(tweet),
        "url": tweet_url(tweet, tid),
        "created_at": created,
        "text": text,
        "prompt": prompt,
        "images": images,
    }


def load_source(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "source": AUTHOR,
            "title": DEFAULT_TITLE,
            "updated_at": "",
            "count": 0,
            "items": [],
        }
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"source must be a PromptSource object: {path}")
    items = raw.get("items")
    if items is None:
        raw["items"] = []
    elif not isinstance(items, list):
        raise ValueError(f"source.items must be a list: {path}")
    return raw


def coverage_from_items(
    items: list[dict[str, Any]],
    *,
    window_days: int,
    horizon: date,
) -> dict[str, Any]:
    dated: list[tuple[datetime, dict[str, Any]]] = []
    image_count = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        image_count += len(item.get("images") or [])
        parsed = parse_time(str(item.get("created_at") or ""))
        if parsed is not None:
            dated.append((parsed, item))
    if not dated:
        next_window = {
            "since": horizon.isoformat(),
            "until": (horizon + timedelta(days=window_days)).isoformat(),
        }
        return {
            "count": 0,
            "images": 0,
            "earliest": None,
            "latest": None,
            "next_window": next_window,
            "remaining_windows": remaining_windows(
                until=horizon + timedelta(days=window_days),
                window_days=window_days,
                horizon=horizon,
            ),
            "complete": False,
        }

    earliest_dt = min(stamp for stamp, _ in dated)
    latest_dt = max(stamp for stamp, _ in dated)
    earliest_day = earliest_dt.date()
    remaining = remaining_windows(
        until=earliest_day,
        window_days=window_days,
        horizon=horizon,
    )
    return {
        "count": len(items),
        "images": image_count,
        "earliest": earliest_dt.isoformat(),
        "latest": latest_dt.isoformat(),
        "next_window": remaining[0] if remaining else None,
        "remaining_windows": remaining,
        "complete": not remaining,
    }


def remaining_windows(
    *,
    until: date,
    window_days: int,
    horizon: date,
) -> list[dict[str, str]]:
    """从 until（Twitter 排除日）往回切长度为 window_days 的窗，直到 horizon。"""
    if window_days <= 0:
        raise ValueError("window_days must be positive")
    windows: list[dict[str, str]] = []
    cursor = until
    while cursor > horizon:
        start = cursor - timedelta(days=window_days)
        if start < horizon:
            start = horizon
        if start >= cursor:
            break
        windows.append({"since": start.isoformat(), "until": cursor.isoformat()})
        cursor = start
    return windows


def search_query(since: str, until: str, author: str = AUTHOR) -> str:
    return f"from:{author} -filter:replies since:{since} until:{until}"


def opencli_argv(
    *,
    opencli: str,
    since: str,
    until: str,
    limit: int,
    author: str = AUTHOR,
) -> list[str]:
    return [
        opencli,
        "twitter",
        "search",
        search_query(since, until, author),
        "--product",
        "live",
        "--limit",
        str(limit),
        "-f",
        "json",
    ]


def default_opencli(explicit: str | None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("OPENCLI") or os.environ.get("OPENCLI_BIN")
    if env:
        return env
    return str(DEFAULT_OPENCLI)


def parse_windows_flag(raw: str | None) -> list[dict[str, str]]:
    if not raw:
        return []
    windows: list[dict[str, str]] = []
    for chunk in re.split(r"[\s,]+", raw.strip()):
        if not chunk:
            continue
        if ":" not in chunk:
            raise ValueError(f"window must be YYYY-MM-DD:YYYY-MM-DD, got {chunk}")
        since_s, until_s = chunk.split(":", 1)
        since = parse_iso_date(since_s, "--windows")
        until = parse_iso_date(until_s, "--windows")
        if since >= until:
            raise ValueError(f"window since must be before until: {chunk}")
        windows.append({"since": since.isoformat(), "until": until.isoformat()})
    return windows


def is_rate_limited(returncode: int, stdout: str, stderr: str) -> bool:
    blob = f"{stdout}\n{stderr}"
    if RATE_LIMIT_RE.search(blob):
        return True
    return returncode == 429


def rate_limit_payload(window: dict[str, str], attempt: int) -> dict[str, Any]:
    return {
        "rate_limited": True,
        "window": {"since": window["since"], "until": window["until"]},
        "attempt": attempt,
    }


def emit_rate_limit(window: dict[str, str], attempt: int) -> int:
    print(json.dumps(rate_limit_payload(window, attempt), ensure_ascii=False))
    print(
        f"OpenCLI/X rate limited on {window['since']}..{window['until']} "
        f"(attempt {attempt}); caller owns the rest/stop policy",
        file=sys.stderr,
    )
    return RATE_LIMIT_EXIT


def resolve_windows(args: argparse.Namespace) -> list[dict[str, str]]:
    listed = parse_windows_flag(getattr(args, "windows", None))
    if listed:
        return listed
    since = getattr(args, "since", None)
    until = getattr(args, "until", None)
    if since or until:
        if not since or not until:
            raise ValueError("pull/run need both --since and --until, or --windows")
        start = parse_iso_date(since, "--since")
        end = parse_iso_date(until, "--until")
        if start >= end:
            raise ValueError("--since must be before --until")
        return [{"since": start.isoformat(), "until": end.isoformat()}]
    coverage = coverage_from_source(Path(args.source), args)
    nxt = coverage.get("next_window")
    if not nxt:
        return []
    return [nxt]


def coverage_from_source(path: Path, args: argparse.Namespace) -> dict[str, Any]:
    source = load_source(path)
    items = [item for item in source.get("items") or [] if isinstance(item, dict)]
    horizon = parse_iso_date(args.horizon, "--horizon")
    info = coverage_from_items(
        items,
        window_days=int(args.window_days),
        horizon=horizon,
    )
    info["source"] = str(path)
    info["window_days"] = int(args.window_days)
    info["horizon"] = horizon.isoformat()
    if info.get("next_window"):
        info["query"] = search_query(
            info["next_window"]["since"],
            info["next_window"]["until"],
            getattr(args, "author", AUTHOR),
        )
    return info


def mode_resolve_coverage(args: argparse.Namespace) -> int:
    path = Path(args.source)
    if not path.exists():
        print(f"source missing: {path}", file=sys.stderr)
        return 1
    print(json.dumps(coverage_from_source(path, args), ensure_ascii=False, indent=2))
    return 0


def run_opencli(
    argv: list[str],
    *,
    dry_run: bool,
) -> tuple[int, str, str]:
    if dry_run:
        return 0, "", ""
    result = subprocess.run(argv, capture_output=True, text=True, check=False)
    return result.returncode, result.stdout, result.stderr


def pull_window(
    args: argparse.Namespace,
    window: dict[str, str],
    *,
    attempt: int = 1,
) -> tuple[int, dict[str, Any]]:
    argv = opencli_argv(
        opencli=default_opencli(args.opencli),
        since=window["since"],
        until=window["until"],
        limit=int(args.limit),
        author=args.author,
    )
    out_path = Path(args.out) if args.out else Path(f"/tmp/xxd-{window['since']}-{window['until']}.json")
    if args.dry_run:
        return 0, {
            "dry_run": True,
            "argv": argv,
            "query": search_query(window["since"], window["until"], args.author),
            "out": str(out_path),
            "window": window,
        }

    returncode, stdout, stderr = run_opencli(argv, dry_run=False)
    if stderr:
        print(stderr, file=sys.stderr, end="" if stderr.endswith("\n") else "\n")
    if is_rate_limited(returncode, stdout, stderr):
        return RATE_LIMIT_EXIT, rate_limit_payload(window, attempt)
    if returncode != 0:
        return 1, {
            "ok": False,
            "returncode": returncode,
            "window": window,
            "error": (stderr or stdout).strip()[:500],
        }
    write_text_atomically(out_path, stdout)
    return 0, {
        "ok": True,
        "window": window,
        "out": str(out_path),
        "bytes": len(stdout.encode("utf-8")),
        "argv": argv,
    }


def mode_pull(args: argparse.Namespace) -> int:
    windows = resolve_windows(args)
    if not windows:
        print(json.dumps({"pulled": 0, "complete": True}, ensure_ascii=False))
        return 0
    if len(windows) > 1:
        print("pull takes one window; use --mode run --windows for a list", file=sys.stderr)
        return 1
    code, payload = pull_window(args, windows[0], attempt=1)
    if code == RATE_LIMIT_EXIT:
        return emit_rate_limit(windows[0], 1)
    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.dry_run else None))
    return code


def ingest_raw(
    raw_path: Path,
    source_path: Path,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    source = load_source(source_path)
    existing_items = [item for item in source.get("items") or [] if isinstance(item, dict)]
    existing_ids = {
        str(item.get("id"))
        for item in existing_items
        if item.get("id")
    }
    raw_tweets = load_json_tweets(raw_path)
    added: list[dict[str, Any]] = []
    skipped_dup = 0
    skipped_no_image = 0
    skipped_no_prompt = 0
    skipped_other = 0
    seen_new: set[str] = set()
    for tweet in raw_tweets:
        tid = tweet_id(tweet)
        if not tid:
            skipped_other += 1
            continue
        if tid in existing_ids or tid in seen_new:
            skipped_dup += 1
            continue
        images = extract_images(tweet)
        if not images:
            skipped_no_image += 1
            continue
        if not extract_prompt(tweet_text(tweet)):
            skipped_no_prompt += 1
            continue
        item = prompt_item_from_tweet(tweet)
        if item is None:
            skipped_other += 1
            continue
        added.append(item)
        seen_new.add(tid)

    merged = list(existing_items) + added
    stamp = now or datetime.now(timezone.utc)
    source["source"] = source.get("source") or AUTHOR
    source["title"] = source.get("title") or DEFAULT_TITLE
    source["updated_at"] = stamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    source["count"] = len(merged)
    source["items"] = merged
    write_json_atomically(source_path, source)
    return {
        "source": str(source_path),
        "raw": str(raw_path),
        "added": len(added),
        "added_ids": [item["id"] for item in added],
        "skipped_dup": skipped_dup,
        "skipped_no_image": skipped_no_image,
        "skipped_no_prompt": skipped_no_prompt,
        "skipped_other": skipped_other,
        "count": source["count"],
        "updated_at": source["updated_at"],
    }


def mode_ingest(args: argparse.Namespace) -> int:
    raw_path = Path(args.raw)
    if not raw_path.exists():
        print(f"raw missing: {raw_path}", file=sys.stderr)
        return 1
    if args.dry_run:
        print(
            json.dumps(
                {
                    "dry_run": True,
                    "raw": str(raw_path),
                    "source": str(Path(args.source)),
                    "raw_tweets": len(load_json_tweets(raw_path)),
                },
                ensure_ascii=False,
            )
        )
        return 0
    print(json.dumps(ingest_raw(raw_path, Path(args.source)), ensure_ascii=False))
    return 0


def mode_run(args: argparse.Namespace) -> int:
    windows = resolve_windows(args)
    if not windows:
        print(json.dumps({"complete": True, "ran": 0}, ensure_ascii=False))
        return 0
    summaries: list[dict[str, Any]] = []
    for index, window in enumerate(windows, start=1):
        raw_out = args.out or f"/tmp/xxd-{window['since']}-{window['until']}.json"
        pull_args = argparse.Namespace(**vars(args))
        pull_args.out = raw_out
        pull_args.since = window["since"]
        pull_args.until = window["until"]
        pull_args.windows = None
        pull_code, pull_payload = pull_window(pull_args, window, attempt=index)
        if pull_code == RATE_LIMIT_EXIT:
            return emit_rate_limit(window, index)
        if pull_code != 0:
            print(json.dumps(pull_payload, ensure_ascii=False))
            return pull_code
        if args.dry_run:
            summaries.append(pull_payload)
            continue
        ingest_result = ingest_raw(Path(raw_out), Path(args.source))
        summaries.append({"pull": pull_payload, "ingest": ingest_result})
    print(json.dumps({"ran": len(summaries), "windows": summaries}, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Collect @xiaoxiaodong01 image+prompt tweets via local OpenCLI "
            "and append them to data/prompts/xiaoxiaodong01.json"
        )
    )
    parser.add_argument(
        "--mode",
        default="resolve-coverage",
        choices=["resolve-coverage", "pull", "ingest", "run"],
        help="resolve-coverage (default) | pull | ingest | run",
    )
    parser.add_argument(
        "--source",
        default=str(DEFAULT_SOURCE),
        help="PromptSource JSON (default data/prompts/xiaoxiaodong01.json)",
    )
    parser.add_argument(
        "--raw",
        help="raw OpenCLI JSON for ingest",
    )
    parser.add_argument(
        "--out",
        help="raw JSON output path for pull/run",
    )
    parser.add_argument("--since", help="window start YYYY-MM-DD (Twitter since, inclusive)")
    parser.add_argument("--until", help="window end YYYY-MM-DD (Twitter until, exclusive)")
    parser.add_argument(
        "--windows",
        help="comma/space list of since:until pairs for run (stops on first 429)",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=DEFAULT_WINDOW_DAYS,
        help="backward window length (default 7)",
    )
    parser.add_argument(
        "--horizon",
        default=DEFAULT_HORIZON.isoformat(),
        help="stop walking backward at this date (default 2026-01-01)",
    )
    parser.add_argument(
        "--author",
        default=AUTHOR,
        help="Twitter from: author (default xiaoxiaodong01)",
    )
    parser.add_argument(
        "--opencli",
        default=None,
        help="OpenCLI binary (env OPENCLI / OPENCLI_BIN, else ~/.local/bin/opencli)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help="OpenCLI --limit (default 80)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the OpenCLI argv; never call the network",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.mode == "resolve-coverage":
            return mode_resolve_coverage(args)
        if args.mode == "pull":
            if not args.since or not args.until:
                if args.windows:
                    print("pull is one window; pass --since/--until", file=sys.stderr)
                    return 1
                # allow computing the next window from the file
            return mode_pull(args)
        if args.mode == "ingest":
            if not args.raw:
                print("ingest needs --raw", file=sys.stderr)
                return 1
            return mode_ingest(args)
        if args.mode == "run":
            return mode_run(args)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
