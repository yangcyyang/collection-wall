#!/usr/bin/env node
/**
 * 从 Cola Skill 公开目录 API 入库到 data/skills/colaskill.json，并下载封面到 data/skills/covers/。
 * 也可读入 --from dump.json（API 原始 feed 或已规范化 catalog）。
 *
 *   node scripts/colaskill-ingest.mjs
 *   node scripts/colaskill-ingest.mjs --from dump.json --out data/skills/colaskill.json
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSkillFeed, collectColaskill, mapApiSkill } from "../site/src/lib/colaskill.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUT = resolve(repoRoot, "data/skills/colaskill.json");
const DEFAULT_COVERS = resolve(repoRoot, "data/skills/covers");

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? resolve(argv[index + 1]) : "";
}

function coverName(slug, url) {
  const clean = String(url).split("?")[0];
  const extension = extname(clean) || ".png";
  return `${slug}${extension}`;
}

function downloadUrl(url) {
  if (!url) return "";
  if (url.includes("x-oss-process=")) return url;
  if (url.includes("files.meetcola.com")) {
    return `${url}${url.includes("?") ? "&" : "?"}x-oss-process=image/resize,w_640`;
  }
  return url;
}

async function readDump(file) {
  const raw = JSON.parse(await readFile(file, "utf8"));
  const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const mapped = items.map((item) => {
    if (item?.headline && item?.slug && !item?.result_teaser && !item?.preview_image_url) return item;
    return mapApiSkill(item);
  }).filter(Boolean);
  return buildSkillFeed({ items: mapped, updated_at: raw.updated_at });
}

async function downloadCover(item, coversDir, fetchFn) {
  const source = downloadUrl(item.cover_source || item.preview_image_urls?.[0]);
  if (!item.slug) return item;
  const name = coverName(item.slug, item.cover_source || item.preview_image_urls?.[0] || ".png");
  const target = resolve(coversDir, name);
  try {
    await access(target);
    return { ...item, cover: item.cover || `skills/covers/${name}` };
  } catch {
    /* download below */
  }
  if (!source) return item;
  try {
    const response = await fetchFn(source, { headers: { "User-Agent": "collection-wall-skills/1.0" } });
    if (!response.ok) return item;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32) return item;
    await writeFile(target, bytes);
    return { ...item, cover: `skills/covers/${name}` };
  } catch {
    return item;
  }
}

async function withCovers(feed, coversDir, fetchFn, skipCovers) {
  if (skipCovers) return feed;
  await mkdir(coversDir, { recursive: true });
  const items = [];
  const queue = [...feed.items];
  const workers = 6;
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      items.push(await downloadCover(item, coversDir, fetchFn));
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  const byId = new Map(items.map((item) => [item.id, item]));
  return buildSkillFeed({
    items: feed.items.map((item) => byId.get(item.id) ?? item),
    updated_at: feed.updated_at,
    error: feed.error,
  });
}

const argv = process.argv.slice(2);
const from = flagValue(argv, "--from");
const out = flagValue(argv, "--out") || DEFAULT_OUT;
const coversDir = flagValue(argv, "--covers") || DEFAULT_COVERS;
const skipCovers = argv.includes("--skip-covers");

const collected = from
  ? await readDump(from)
  : await collectColaskill();
const feed = await withCovers(collected, coversDir, fetch, skipCovers);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(feed, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ out, count: feed.count, error: feed.error ?? null })}\n`);
if (feed.error && feed.count === 0) process.exit(1);
