import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const essaysDirectory = resolve(process.cwd(), "../data/essays");

export const ESSAY_KINDS = [
  { id: "translation", label: "译文" },
  { id: "original", label: "我的文章" },
  { id: "curated", label: "精选" },
];

const KIND_LABEL = Object.fromEntries(ESSAY_KINDS.map((kind) => [kind.id, kind.label]));

function emptyFeed() {
  return {
    source: "",
    title: "",
    description: "",
    updated_at: "",
    count: 0,
    items: [],
  };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function httpUrl(value) {
  const url = text(value);
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}

function safeBodyFile(value, id) {
  const name = text(value) || `${id}.md`;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(name) ? name : `${id}.md`;
}

export function essayKindLabel(kind) {
  return KIND_LABEL[kind] ?? "";
}

function essayKind(raw) {
  const value = text(raw.category) || text(raw.kind);
  if (value === "translation" || value === "译文") return "translation";
  if (value === "original" || value === "我的文章") return "original";
  if (value === "curated" || value === "精选") return "curated";
  return "";
}

function authorHandle(raw) {
  const explicit = text(raw.author_handle).replace(/^@/, "");
  if (explicit) return explicit;
  const match = /@([A-Za-z0-9_]+)/.exec(text(raw.author));
  return match?.[1] ?? "";
}

export function normalizeEssay(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = text(raw.id);
  const title = text(raw.title_zh) || text(raw.title);
  const kind = essayKind(raw);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !title || !kind) return null;
  const summary = text(raw.summary_zh) || text(raw.summary);
  const bodyZh = typeof raw.body_zh === "string" ? raw.body_zh.trim() : "";
  return {
    id,
    kind,
    category: kind,
    kind_label: essayKindLabel(kind),
    title,
    title_zh: title,
    title_en: text(raw.title_en),
    author: text(raw.author),
    author_handle: authorHandle(raw),
    published_at: text(raw.published_at),
    source_url: httpUrl(raw.source_url),
    article_url: httpUrl(raw.article_url),
    blog_url: httpUrl(raw.blog_url),
    summary,
    summary_zh: summary,
    body_file: safeBodyFile(raw.body_file, id),
    body_zh: bodyZh,
    capture_status: raw.capture_status === "partial" ? "partial" : "full",
  };
}

function asFeed(raw) {
  if (!Array.isArray(raw?.items)) return emptyFeed();
  const items = raw.items.map(normalizeEssay).filter(Boolean);
  return {
    source: text(raw.source),
    title: text(raw.title),
    description: text(raw.description),
    updated_at: text(raw.updated_at),
    count: items.length,
    items,
  };
}

async function readCatalog(target) {
  const file = target.endsWith(".json") ? target : resolve(target, "index.json");
  try {
    return asFeed(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return emptyFeed();
  }
}

function catalogDirectory(target) {
  return target.endsWith(".json") ? resolve(target, "..") : resolve(target);
}

export async function getEssaysFeed(target = essaysDirectory) {
  return readCatalog(target);
}

export function essayKindFilters(items = []) {
  return ESSAY_KINDS.map((kind) => ({
    ...kind,
    count: items.filter((item) => item.kind === kind.id).length,
  }));
}

export function essaySearchBlob(item) {
  return [
    item?.title,
    item?.title_en,
    item?.author,
    item?.author_handle,
    item?.summary,
    item?.kind_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/\[([^\]]+)\]\((?!https?:\/\/)[^)]*\)/g, "$1");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" rel="noopener noreferrer">$1</a>',
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return html;
}

function isBlockStart(line) {
  return /^(#{1,3} |> |[-*] )/.test(line);
}

export function renderEssayMarkdown(markdown) {
  const lines = String(markdown ?? "").replaceAll("\r\n", "\n").split("\n");
  const html = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 3);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith("> ")) {
        quote.push(lines[index].slice(2).trim());
        index += 1;
      }
      html.push(`<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`);
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*] /.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].slice(2).trim())}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }
  return html.join("\n");
}

async function readBody(directory, fileName) {
  const root = resolve(directory);
  const file = resolve(root, fileName);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return "";
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

export async function getEssay(id, target = essaysDirectory) {
  const feed = await getEssaysFeed(target);
  const item = feed.items.find((entry) => entry.id === id);
  if (!item) return null;
  const markdown = item.body_zh || await readBody(catalogDirectory(target), item.body_file);
  return {
    ...item,
    markdown,
    html: renderEssayMarkdown(markdown),
  };
}
