#!/usr/bin/env python3
"""
Website Capture: URL -> data/tools/{id}.json (F001 线A，去 Notion 化版本)
Usage: capture.py <URL>

改造自 wtf-was-that-site/capture.py（见 docs/discussions/2026-07-10-F001-Phase0-*-spike.md）：
- Notion 写入 -> 本地 JSON（data/tools/*.json + data/tools/covers/*.jpg）
- Gemini 多模态分析 -> DeepSeek 纯文本分析（DeepSeek 无视觉输入，改吃 title/og/正文）
"""
import sys, os, json, re, sqlite3, uuid
_ssl_file = os.environ.get("SSL_CERT_FILE")
if _ssl_file and not os.path.exists(_ssl_file):
    os.environ.pop("SSL_CERT_FILE", None)
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import requests

PIPELINE_ROOT = Path(__file__).parent
REPO_ROOT = PIPELINE_ROOT.parent
DATA_DIR = REPO_ROOT / "data" / "tools"
COVERS_DIR = DATA_DIR / "covers"
LOG_DIR = PIPELINE_ROOT / "logs"
ENV_FILE = PIPELINE_ROOT / ".env"
SCREENSHOT_DIR = Path(os.path.expanduser(os.environ.get("SCREENSHOT_DIR", "~/Pictures/bookmark-captures")))

# ---------- Env loading ----------
def load_env():
    env = {}
    if not ENV_FILE.exists():
        raise SystemExit(
            f"❌ 找不到 .env (expected at: {ENV_FILE})\n"
            f"   cp .env.example .env  然后填 DEEPSEEK_API_KEY"
        )
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"').strip("'")
    return env

ENV = load_env()
DEEPSEEK_API_KEY = ENV.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = ENV.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
if not DEEPSEEK_API_KEY:
    raise SystemExit("❌ .env 缺必需字段: DEEPSEEK_API_KEY")

# ---------- Chromium browser history (unchanged from spike) ----------
BROWSER_HISTORIES = {
    "Chrome": Path.home() / "Library/Application Support/Google/Chrome/Default/History",
    "Edge": Path.home() / "Library/Application Support/Microsoft Edge/Default/History",
    "Brave": Path.home() / "Library/Application Support/BraveSoftware/Brave-Browser/Default/History",
    "Arc": Path.home() / "Library/Application Support/Arc/User Data/Default/History",
}

def query_browser_history(domain: str):
    total_visits = 0
    latest_time = 0
    breakdown = {}
    for browser, db_path in BROWSER_HISTORIES.items():
        if not db_path.exists():
            continue
        try:
            conn = sqlite3.connect(f"file:{db_path}?immutable=1", uri=True, timeout=2)
            cur = conn.cursor()
            cur.execute("""
                SELECT COUNT(*), COALESCE(MAX(v.visit_time), 0)
                FROM visits v JOIN urls u ON v.url = u.id
                WHERE u.url LIKE ? OR u.url LIKE ?
            """, (f"%//{domain}/%", f"%//{domain}"))
            vc, lt = cur.fetchone()
            conn.close()
            if vc:
                total_visits += vc
                breakdown[browser] = vc
            if lt and lt > latest_time:
                latest_time = lt
        except Exception:
            pass
    last_iso = None
    if latest_time:
        epoch_seconds = (latest_time / 1_000_000) - 11644473600
        try:
            last_iso = datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).date().isoformat()
        except Exception:
            last_iso = None
    return {"visit_count": int(total_visits), "last_visited": last_iso, "breakdown": breakdown}

def visit_count_to_status(n: int) -> str:
    if n > 30: return "⭐ 高频"
    if n >= 11: return "📦 常用"
    if n >= 3: return "🔍 偶尔"
    return "🆕 待试"

# ---------- GitHub-aware (unchanged from spike) ----------
GITHUB_REPO_RE = re.compile(r"^https?://github\.com/([^/?#]+)/([^/?#]+)(?:/.*)?/?$")

def parse_github_repo(url: str):
    m = GITHUB_REPO_RE.match(url)
    if not m:
        return None
    owner, repo = m.group(1), m.group(2).rstrip("/")
    if owner in ("settings", "marketplace", "topics", "explore", "trending", "issues"):
        return None
    return owner, repo

def fetch_github_metadata(owner: str, repo: str):
    try:
        r = requests.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers={"Accept": "application/vnd.github+json"},
            timeout=15,
        )
        if r.status_code != 200:
            return None
        d = r.json()
        return {
            "stars": d.get("stargazers_count", 0),
            "language": d.get("language") or "",
            "topics": d.get("topics") or [],
            "description": d.get("description") or "",
        }
    except Exception:
        return None

# 两层分类树，保持和 spike 报告一致（若后续要改，同步 site/ 前端）
TAXONOMY = {
    "🎨 视觉创作": ["图像生成", "图像处理", "视频生成", "设计资源", "3D / 动效"],
    "✍️ 文字写作": ["写作助手", "内容平台", "翻译润色"],
    "🌐 网页与代码": ["AI 编程助手", "部署 / 建站", "组件 / UI 库", "开发工具", "CLI 工具"],
    "🔊 声音": ["音乐生成", "语音 / TTS", "音频处理"],
    "🌟 灵感与审美": ["设计灵感", "字体 / 排版", "配色 / 渐变", "艺术创意编程"],
    "📚 知识与学习": ["学习平台", "电子书", "工具书 / 词典"],
    "🛠️ 办公与效率": ["PPT 演示", "笔记 / Notion", "自动化 / 无代码", "浏览器扩展", "其他效率"],
    "🎮 兴趣娱乐": ["游戏", "趣味"],
    "📦 资源集合": ["Awesome 合集", "工具导航", "素材集"],
    "🌍 出海与基建": ["API 中转", "VPN / 网络", "跨境支付"],
    "🤖 AI 大模型": ["提示词工程", "大模型对话", "多模态 / Agent"],
    "🔬 其他": ["其他"],
}
CATEGORIES = list(TAXONOMY.keys())
TAXONOMY_TREE_STR = "\n".join(f"- {c}: {', '.join(subs)}" for c, subs in TAXONOMY.items())

# ---------- Helpers ----------
def log(msg):
    print(msg, flush=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_DIR / "capture.log", "a") as f:
        f.write(f"[{datetime.now().isoformat()}] {msg}\n")

def notify(title, msg):
    safe_title = title.replace('"', "'")
    safe_msg = msg.replace('"', "'")
    os.system(f'osascript -e \'display notification "{safe_msg}" with title "{safe_title}" sound name "Glass"\'')

def is_uniform_image(jpg_bytes: bytes, threshold: float = 0.85) -> bool:
    if not jpg_bytes or len(jpg_bytes) < 1000:
        return True
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(jpg_bytes)).convert("RGB")
        w, h = img.size
        samples = []
        for y in range(0, h, 8):
            for x in range(0, w, 8):
                samples.append(img.getpixel((x, y)))
        if not samples:
            return True
        from collections import Counter
        quantized = [(r // 16, g // 16, b // 16) for r, g, b in samples]
        most_common, count = Counter(quantized).most_common(1)[0]
        return count / len(quantized) > threshold
    except Exception as e:
        log(f"  ⚠ is_uniform_image 出错(放过): {e}")
        return False

def safe_filename(s, maxlen=80):
    s = re.sub(r'[/\\:*?"<>|]', '_', str(s)).strip().strip('.')
    return s[:maxlen] or "untitled"

# ---------- Step 1: scrape ----------
def fetch_page(url: str):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0 Safari/537.36"),
        )
        page = ctx.new_page()
        try:
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
        except Exception as e:
            log(f"⚠ page.goto warning: {e}")
        title = page.title() or ""

        def safe_screenshot(full_page=False, quality=85):
            try:
                return page.screenshot(full_page=full_page, type="jpeg", quality=quality,
                                        timeout=10000, animations="disabled")
            except Exception as e:
                log(f"  ⚠ 截图失败({'full' if full_page else 'fold'}): {str(e)[:120]}")
                return None

        screenshot = safe_screenshot(full_page=False)
        if screenshot and is_uniform_image(screenshot, threshold=0.85):
            log("  ⚠ 首抓 cover 检测同色像素 > 85%, 等 4s 重抓")
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            page.wait_for_timeout(4000)
            retry = safe_screenshot(full_page=False)
            if retry:
                screenshot = retry

        if not screenshot:
            screenshot = b""

        og_image = page.evaluate("""() => {
            const m = document.querySelector('meta[property="og:image"]')
                  || document.querySelector('meta[name="twitter:image"]');
            return m ? m.content : null;
        }""")
        og_desc = page.evaluate("""() => {
            const m = document.querySelector('meta[property="og:description"]')
                  || document.querySelector('meta[name="description"]');
            return m ? m.content : '';
        }""") or ""
        page_text = page.evaluate("""() => (document.body.innerText || '').slice(0, 6000)""")
        browser.close()
        return {"title": title, "screenshot": screenshot, "og_image": og_image,
                "og_desc": og_desc, "page_text": page_text}

# ---------- Step 2: AI analyze (DeepSeek, 纯文本, 无视觉输入) ----------
def analyze(url, pd):
    gh_meta = None
    gh = parse_github_repo(url)
    github_section = ""
    if gh:
        log(f"  🐙 检测到 GitHub repo: {gh[0]}/{gh[1]}")
        gh_meta = fetch_github_metadata(gh[0], gh[1])
        if gh_meta:
            github_section = f"""
[GitHub metadata]
Stars: {gh_meta['stars']} | Language: {gh_meta['language']} | Topics: {', '.join(gh_meta['topics'])}
Description: {gh_meta['description']}
"""

    prompt = f"""你是工具检索助手。看一个工具时,任务不是描述它,而是逆向模拟搜索者:
"未来要找它/类似它的工具时会怎么问?metadata 里要有什么词才能命中?"

按这个心智产出 JSON(必须是合法 JSON,不要 markdown 代码块):

{{
  "name": "工具/网站名 (2-12 字,英文原名优先)",
  "headline": "一句话定位,15-30 字",
  "intro": "1-2 段背景介绍,100-200 字",
  "category": "从下面 12 个一级类里选 1 个",
  "subcategory": "从所选 category 对应的二级类里选 1 个,若不属于任何二级留空字符串",
  "tags": ["5-8 个 flat 标签"],
  "capabilities": ["5-8 个 '动词+具体对象' 短语"],
  "scenarios": ["3-6 个 '在做 X 时' 表达"],
  "search_keywords": ["6-12 个用户可能用的搜索词"],
  "alternatives": {{"replaces": [], "similar_to": [], "pairs_with": []}},
  "tech_highlights": ["可选 0-4 个技术亮点"]
}}

# 一级 + 二级 分类树
{TAXONOMY_TREE_STR}

判断 category 时优先看「输出物本质」和「主要任务」,不是承载形式。
{github_section}

URL: {url}
页面标题: {pd['title']}
og:description: {pd['og_desc']}
页面文字(节选):
{pd['page_text']}
"""
    resp = requests.post(
        f"{DEEPSEEK_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        },
        timeout=60,
    )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"].strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if gh_meta:
        parsed["_stars"] = gh_meta.get("stars", 0)
    return parsed

# ---------- Step 3: dedupe against existing data/tools/*.json ----------
def find_existing_record(url):
    if not DATA_DIR.exists():
        return None
    for f in DATA_DIR.glob("*.json"):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if rec.get("url") == url:
            return rec
    return None

# ---------- Step 4: write JSON record ----------
def write_json_record(url, analysis, screenshot_bytes, history, record_id, my_notes=""):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    COVERS_DIR.mkdir(parents=True, exist_ok=True)

    cat = analysis.get("category", "🔬 其他")
    if cat not in CATEGORIES:
        cat = "🔬 其他"
    sub = (analysis.get("subcategory") or "").strip()
    if sub and sub not in TAXONOMY.get(cat, []):
        sub = ""

    cover_rel = None
    if screenshot_bytes and len(screenshot_bytes) > 1000:
        cover_path = COVERS_DIR / f"{record_id}.jpg"
        cover_path.write_bytes(screenshot_bytes)
        cover_rel = f"covers/{record_id}.jpg"

    record = {
        "id": record_id,
        "url": url,
        "name": (analysis.get("name") or urlparse(url).netloc)[:80],
        "headline": (analysis.get("headline") or "")[:300],
        "intro": (analysis.get("intro") or "").strip(),
        "category": cat,
        "subcategory": sub,
        "tags": [str(t)[:40] for t in (analysis.get("tags") or [])[:8]],
        "capabilities": [str(c) for c in (analysis.get("capabilities") or [])],
        "scenarios": [str(s) for s in (analysis.get("scenarios") or [])],
        "search_keywords": [str(k) for k in (analysis.get("search_keywords") or [])],
        "alternatives": analysis.get("alternatives") or {"replaces": [], "similar_to": [], "pairs_with": []},
        "tech_highlights": [str(t) for t in (analysis.get("tech_highlights") or [])],
        "cover": cover_rel,
        "status": visit_count_to_status(history.get("visit_count", 0)),
        "visit_count": history.get("visit_count", 0),
        "last_visited": history.get("last_visited"),
        "added_at": datetime.now().isoformat(timespec="seconds"),
        "my_notes": my_notes,
    }
    if analysis.get("_stars"):
        record["github_stars"] = analysis["_stars"]

    (DATA_DIR / f"{record_id}.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return record

# ---------- Main ----------
def main():
    if len(sys.argv) < 2:
        print("Usage: capture.py <URL>")
        sys.exit(1)
    url = sys.argv[1].strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    log(f"📸 抓取 {url}")

    existing = find_existing_record(url)
    record_id = existing["id"] if existing else str(uuid.uuid4())
    my_notes = existing.get("my_notes", "") if existing else ""
    if existing:
        log(f"♻ 已有记录 {record_id},将覆盖(保留 my_notes)")

    try:
        pd = fetch_page(url)
    except Exception as e:
        log(f"❌ 抓取失败: {e}")
        notify("❌ 收藏失败", f"抓取失败: {str(e)[:100]}")
        sys.exit(2)

    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    domain = urlparse(url).netloc.replace(".", "_")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    if pd["screenshot"]:
        (SCREENSHOT_DIR / f"{ts}_{domain}.jpg").write_bytes(pd["screenshot"])

    log("🧠 DeepSeek 分析...")
    try:
        analysis = analyze(url, pd)
    except Exception as e:
        log(f"❌ AI 分析失败: {e}")
        notify("❌ 收藏失败", f"AI 分析失败: {str(e)[:100]}")
        sys.exit(3)
    log(f"  → {analysis.get('name')} | {analysis.get('category')} / {analysis.get('subcategory') or '—'}")

    domain = urlparse(url).netloc
    history = query_browser_history(domain)
    log(f"📊 浏览器历史: {history['visit_count']} 次访问, 状态: {visit_count_to_status(history['visit_count'])}")

    record = write_json_record(url, analysis, pd["screenshot"], history, record_id, my_notes=my_notes)
    log(f"  ✅ 写入 {record_id}.json")

    notify(f"✓ 已收藏: {record['name']}", record['headline'])
    print(json.dumps({"id": record_id, "name": record["name"], "category": record["category"]}, ensure_ascii=False))

if __name__ == "__main__":
    main()
