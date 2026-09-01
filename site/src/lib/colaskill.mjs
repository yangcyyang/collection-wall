export const COLASKILL_SOURCE = "colaskill";
export const COLASKILL_TITLE = "Cola Skill";
export const COLASKILL_HOME = "https://colaskill.com/zh/";
export const COLASKILL_API = "https://api.colaos.ai/v1/skill-directory/skills";
export const COLASKILL_USER_AGENT = "Mozilla/5.0 (compatible; collection-wall-skills/1.0; +https://wall.yangcyyang.cn/)";

export const MARKETPLACE_CATEGORIES = [
  { id: "creative_design", zh: "创作设计" },
  { id: "growth_marketing", zh: "增长营销" },
  { id: "product_technology", zh: "产品技术" },
  { id: "solo_business", zh: "一人公司" },
  { id: "workplace_office", zh: "职场办公" },
  { id: "self_improvement", zh: "自我提升" },
  { id: "teaching", zh: "教学讲课" },
  { id: "research_analysis", zh: "调研分析" },
  { id: "ecommerce_operations", zh: "电商运营" },
];

function hasAny(list = [], ...values) {
  return values.some((value) => list.includes(value));
}

/** Cola Skill 站点公开的分类芯片规则（skills bundle It()）。 */
export function marketplaceCategories({ categories = [], tasks = [], audiences = [] } = {}) {
  const matched = [];
  if (hasAny(categories, "design_video") || hasAny(tasks, "image_design", "video")) matched.push("创作设计");
  if (hasAny(categories, "marketing_growth")) matched.push("增长营销");
  if (hasAny(categories, "engineering", "product_project")) matched.push("产品技术");
  if (hasAny(categories, "finance_services") || hasAny(audiences, "founder")) matched.push("一人公司");
  if (hasAny(categories, "documents_slides") || (hasAny(audiences, "professional") && hasAny(tasks, "project_management", "slides", "translation"))) {
    matched.push("职场办公");
  }
  if (hasAny(categories, "content_knowledge") && hasAny(tasks, "knowledge_management", "teaching_research")) {
    matched.push("自我提升");
  }
  if (hasAny(audiences, "educator") || hasAny(tasks, "teaching_research")) matched.push("教学讲课");
  if (hasAny(categories, "writing_research") || hasAny(tasks, "data_analysis")) matched.push("调研分析");
  if (hasAny(categories, "marketing_growth") && hasAny(tasks, "automation", "data_analysis", "publishing")) {
    matched.push("电商运营");
  }
  return matched;
}

export function parseGithubStars(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function githubUrlFrom(url = "") {
  const raw = String(url ?? "").trim();
  if (!/^https?:\/\/github\.com\//i.test(raw)) return "";
  return raw.replace(/\.git$/i, "").replace(/\/+$/, "");
}

function text(value) {
  return String(value ?? "").trim();
}

function stringList(values) {
  return [...new Set((values ?? []).map((item) => text(item)).filter(Boolean))];
}

export function mapApiSkill(raw = {}) {
  const slug = text(raw.slug);
  if (!slug) return null;
  const stars = parseGithubStars(raw.stars);
  const sourceUrl = text(raw.source_url) || text(raw.homepage_url);
  return {
    id: slug,
    slug,
    title: text(raw.title) || text(raw.name) || slug,
    headline: text(raw.result_teaser) || text(raw.description),
    author: text(raw.author),
    github_url: githubUrlFrom(sourceUrl),
    github_stars: stars,
    categories: marketplaceCategories({
      categories: raw.categories ?? [],
      tasks: raw.task_tags ?? raw.tasks ?? [],
      audiences: raw.user_tags ?? raw.audiences ?? [],
    }),
    license: text(raw.license_type) || "unknown",
    detail_url: `${COLASKILL_HOME}${slug}`,
    cover: text(raw.cover),
    cover_source: text(raw.preview_image_url) || text(raw.cover_source),
    example_prompts: stringList(raw.guide_prompts ?? raw.example_prompts).slice(0, 8),
    install_url: `colaos://skills/install?slug=${encodeURIComponent(slug)}`,
    featured: raw.featured === true || raw.homepage_section === "featured",
  };
}

function sortSkills(items) {
  return [...items].sort((left, right) => {
    const featured = Number(Boolean(right.featured)) - Number(Boolean(left.featured));
    if (featured !== 0) return featured;
    const stars = (right.github_stars ?? -1) - (left.github_stars ?? -1);
    if (stars !== 0) return stars;
    return (left.title ?? "").localeCompare(right.title ?? "", "zh-CN");
  });
}

export function buildSkillFeed({ items = [], updated_at, error } = {}) {
  const seen = new Set();
  const uniq = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    uniq.push(item);
  }
  const sorted = sortSkills(uniq);
  const feed = {
    source: COLASKILL_SOURCE,
    title: COLASKILL_TITLE,
    updated_at: updated_at ?? new Date().toISOString(),
    count: sorted.length,
    items: sorted,
  };
  if (error) feed.error = String(error);
  return feed;
}

export function catalogUrl(cursor, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit), sort: "featured" });
  if (cursor) params.set("cursor", cursor);
  return `${COLASKILL_API}?${params}`;
}

async function readCatalogPage(url, fetchFn) {
  const response = await fetchFn(url, {
    headers: { Accept: "application/json", "User-Agent": COLASKILL_USER_AGENT },
  });
  if (!response.ok) throw new Error(`Cola Skill API ${response.status}`);
  const body = await response.json();
  const payload = body?.data ?? body;
  if (body?.ok === false) throw new Error(body?.error?.message ?? "Cola Skill API error");
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    nextCursor: payload?.next_cursor ?? payload?.nextCursor ?? null,
  };
}

export async function collectColaskill({ fetchFn = fetch, now = new Date(), limit = 50 } = {}) {
  const incoming = [];
  let cursor = "";
  try {
    for (let page = 0; page < 40; page += 1) {
      const { items, nextCursor } = await readCatalogPage(catalogUrl(cursor || undefined, limit), fetchFn);
      incoming.push(...items);
      if (!nextCursor || !items.length) break;
      cursor = nextCursor;
    }
    return buildSkillFeed({
      items: incoming.map(mapApiSkill).filter(Boolean),
      updated_at: now.toISOString(),
    });
  } catch (error) {
    return buildSkillFeed({
      items: incoming.map(mapApiSkill).filter(Boolean),
      updated_at: now.toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
