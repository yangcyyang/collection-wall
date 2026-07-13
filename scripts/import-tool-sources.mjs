import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CATEGORY = "🌐 网页与代码";
const AI_CATEGORY = "🤖 AI 大模型";

function stableId(prefix, value) {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 14);
  return `${prefix}-${digest}`;
}

function truncate(value, length) {
  return String(value ?? "").trim().slice(0, length);
}

function normalizeTags(values) {
  return [...new Set((values ?? []).map((value) => truncate(value, 40)).filter(Boolean))].slice(0, 8);
}

function categoryForGithub(record) {
  const searchable = [record.description, record.language, ...(record.topics ?? [])]
    .join(" ")
    .toLowerCase();

  if (/(agent|llm|ai-|openai|claude|codex|prompt|model)/.test(searchable)) return AI_CATEGORY;
  if (/(note|knowledge|document|wiki|obsidian)/.test(searchable)) return "📚 知识与学习";
  if (/(image|video|design|three|3d|animation|webgl)/.test(searchable)) return "🎨 视觉创作";
  if (/(cli|terminal|shell|productivity|automation)/.test(searchable)) return "🛠️ 办公与效率";
  return DEFAULT_CATEGORY;
}

async function copyCover({ cover, sourceCovers, outputCovers, recordId }) {
  if (!cover) return null;
  const fileName = basename(cover);
  const extension = extname(fileName) || ".jpg";
  const source = join(sourceCovers, fileName);
  const targetName = `${recordId}${extension}`;
  try {
    await copyFile(source, join(outputCovers, targetName));
    return `covers/${targetName}`;
  } catch {
    return null;
  }
}

function arsenalRecord(source, importedAt) {
  const id = stableId("arsenal", source.url);
  return {
    id,
    url: source.url,
    name: truncate(source.name, 80) || "未命名工具",
    headline: truncate(source.headline, 300),
    intro: truncate(source.headline, 300),
    category: source.category || DEFAULT_CATEGORY,
    subcategory: source.subcategory || "",
    tags: normalizeTags(source.tags),
    capabilities: [],
    scenarios: [],
    search_keywords: normalizeTags([source.name, source.category, source.subcategory, ...(source.tags ?? [])]),
    alternatives: { replaces: [], similar_to: [], pairs_with: [] },
    tech_highlights: normalizeTags([source.repoType, source.language]),
    cover: null,
    status: source.status || "🆕 待试",
    visit_count: Number(source.visitCount) || 0,
    last_visited: null,
    added_at: importedAt,
    my_notes: source.install ? `使用方式：${source.install}` : "",
    source: "xiaoer-tools-wall",
  };
}

function githubRecord(source, importedAt) {
  const id = stableId("github", source.html_url);
  const tags = normalizeTags([...(source.topics ?? []), source.language]);
  return {
    id,
    url: source.html_url,
    name: truncate(source.name, 80) || "未命名仓库",
    headline: truncate(source.description, 300),
    intro: truncate(source.description, 300),
    category: categoryForGithub(source),
    subcategory: "",
    tags,
    capabilities: [],
    scenarios: [],
    search_keywords: normalizeTags([source.name, source.language, ...(source.topics ?? [])]),
    alternatives: { replaces: [], similar_to: [], pairs_with: [] },
    tech_highlights: source.stargazers_count ? [`GitHub ★ ${source.stargazers_count}`] : [],
    cover: null,
    status: "🆕 待试",
    visit_count: 0,
    last_visited: null,
    added_at: source.starred_at || importedAt,
    my_notes: source.archived ? "仓库已归档" : "",
    source: "github-stars",
  };
}

async function writeRecord(record, outputDir) {
  await writeFile(join(outputDir, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
}

export async function importToolSources({
  arsenalPath,
  starsPath,
  sourceCovers,
  outputDir,
  importedAt = new Date().toISOString(),
}) {
  const outputCovers = join(outputDir, "covers");
  await mkdir(outputCovers, { recursive: true });

  const arsenal = JSON.parse(await readFile(arsenalPath, "utf8"));
  const stars = (await readFile(starsPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const arsenalRecords = await Promise.all(arsenal.map(async (source) => {
    const record = arsenalRecord(source, importedAt);
    record.cover = await copyCover({
      cover: source.cover,
      sourceCovers,
      outputCovers,
      recordId: record.id,
    });
    await writeRecord(record, outputDir);
    return record;
  }));

  const githubRecords = await Promise.all(stars.map(async (source) => {
    const record = githubRecord(source, importedAt);
    await writeRecord(record, outputDir);
    return record;
  }));

  return {
    arsenalCount: arsenalRecords.length,
    githubStarsCount: githubRecords.length,
    records: [...arsenalRecords, ...githubRecords],
  };
}

async function normalizeSeedSources(outputDir) {
  const files = await readdir(outputDir);
  await Promise.all(files.filter((file) => /^seed-.*\.json$/.test(file)).map(async (file) => {
    const path = join(outputDir, file);
    const record = JSON.parse(await readFile(path, "utf8"));
    if (!record.source) {
      record.source = "seed";
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
    }
  }));
}

async function main() {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const arsenalPath = process.env.ARSENAL_SOURCE;
  const sourceCovers = process.env.ARSENAL_COVERS;
  if (!arsenalPath || !sourceCovers) {
    throw new Error("请设置 ARSENAL_SOURCE 与 ARSENAL_COVERS 后再执行导入。");
  }
  const result = await importToolSources({
    arsenalPath,
    starsPath: process.env.STARS_SOURCE ?? join(repoRoot, "data/imports/github-stars.jsonl"),
    sourceCovers,
    outputDir: process.env.TOOLS_OUTPUT ?? join(repoRoot, "data/tools"),
  });
  await normalizeSeedSources(process.env.TOOLS_OUTPUT ?? join(repoRoot, "data/tools"));
  console.log(`导入完成：弹药库 ${result.arsenalCount} 条，GitHub stars ${result.githubStarsCount} 条。`);
}

if (import.meta.main) main();
