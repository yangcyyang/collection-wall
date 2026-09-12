import { promptFacets, sourceLinkLabel } from "./prompt-type.mjs";

function handleAt(author = "") {
  const name = String(author).trim().replace(/^@/, "");
  return name ? `@${name}` : "";
}

export function formatPromptEyebrow(sets = []) {
  const authors = [...new Set(sets.map((set) => handleAt(set.author)).filter(Boolean))];
  if (!authors.length) return "生图提示词";
  return `${authors.length} 位作者 · 生图提示词`;
}

export const PROMPT_PAGE_SIZE = 100;

export function pagePromptSlice(total, page, pageSize = PROMPT_PAGE_SIZE) {
  const size = Math.max(1, Number(pageSize) || PROMPT_PAGE_SIZE);
  const count = Math.max(0, Number(total) || 0);
  const pages = Math.max(1, Math.ceil(count / size));
  const raw = Number.parseInt(page, 10);
  const safePage = Number.isInteger(raw) ? Math.min(pages, Math.max(1, raw)) : 1;
  const start = Math.min(count, (safePage - 1) * size);
  return { page: safePage, pages, start, end: Math.min(count, start + size) };
}

export function toPromptGalleryIndex(sets = []) {
  return sets.map((set) => {
    const images = (set.images ?? []).filter(Boolean);
    return {
      id: set.id,
      cover: images[0] ?? "",
      type: set.type ?? "",
      facets: promptFacets(set),
      prompt: set.prompt ?? "",
      images,
      source: set.source ?? "",
      tweetUrl: set.tweetUrl ?? "",
      sourceLabel: sourceLinkLabel(set.tweetUrl),
      imageCount: images.length,
    };
  });
}

export function encodePromptGalleryIndex(items = []) {
  return JSON.stringify(items).replace(/</g, "\\u003c");
}

export function filterPromptGalleryIndex(items = [], { type = "", facets = [], query = "" } = {}) {
  const needle = String(query).trim().toLowerCase();
  const required = [...facets].filter(Boolean);
  return items.filter((item) => {
    const typeOk = !type || item.type === type;
    const have = item.facets ?? [];
    const facetOk = required.every((facet) => have.includes(facet));
    const searchOk = !needle || String(item.prompt ?? "").toLowerCase().includes(needle);
    return typeOk && facetOk && searchOk;
  });
}

export function pagePromptGallery(items = [], page = 1, pageSize = PROMPT_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const slice = pagePromptSlice(list.length, page, pageSize);
  return {
    ...slice,
    items: list.slice(slice.start, slice.end),
    total: list.length,
    images: list.reduce((sum, item) => sum + Number(item.imageCount ?? item.images?.length ?? 0), 0),
  };
}

export function nextPromptGalleryState(state = {}, patch = {}) {
  const next = {
    type: state.type ?? "",
    facets: Array.isArray(state.facets) ? [...state.facets] : [],
    query: state.query ?? "",
    page: state.page ?? 1,
    ...patch,
  };
  if (Object.hasOwn(patch, "facets")) next.facets = [...(patch.facets ?? [])];
  if (["type", "facets", "query"].some((key) => Object.hasOwn(patch, key))) next.page = 1;
  return next;
}

export function formatPromptGalleryCount({ matched = 0, page = 1, pages = 1 } = {}) {
  return `匹配 ${matched} · 第 ${page}/${pages} 页`;
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
