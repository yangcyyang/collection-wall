function handleAt(author = "") {
  const name = String(author).trim().replace(/^@/, "");
  return name ? `@${name}` : "";
}

export function formatPromptEyebrow(sets = []) {
  const authors = [...new Set(sets.map((set) => handleAt(set.author)).filter(Boolean))];
  if (!authors.length) return "生图提示词";
  return `${authors.length} 位作者 · 生图提示词`;
}

export const PROMPT_PAGE_SIZE = 36;

export function pagePromptSlice(total, page, pageSize = PROMPT_PAGE_SIZE) {
  const size = Math.max(1, Number(pageSize) || PROMPT_PAGE_SIZE);
  const count = Math.max(0, Number(total) || 0);
  const pages = Math.max(1, Math.ceil(count / size));
  const raw = Number.parseInt(page, 10);
  const safePage = Number.isInteger(raw) ? Math.min(pages, Math.max(1, raw)) : 1;
  const start = Math.min(count, (safePage - 1) * size);
  return { page: safePage, pages, start, end: Math.min(count, start + size) };
}

export function parsePromptGalleryQuery(search = "") {
  const query = String(search).replace(/^\?/, "");
  const params = new URLSearchParams(query);
  const tag = params.get("tag") ?? "";
  const raw = Number.parseInt(params.get("page") ?? "1", 10);
  return { tag, page: Number.isInteger(raw) && raw > 0 ? raw : 1 };
}

export function serializePromptGalleryQuery({ tag = "", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `?${text}` : "";
}
