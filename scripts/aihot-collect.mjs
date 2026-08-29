#!/usr/bin/env node
/**
 * 从 AIHOT 公开 v1 API 拉取 selected 7d 精选（分页），按 id 合并写入 data/news/aihot.json。
 * 不抓首页 HTML，不改写 summary/reason，不覆盖窗口外已有条目，无条数上限。
 *
 *   node scripts/aihot-collect.mjs
 *   node scripts/aihot-collect.mjs --out data/news/aihot.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { collectAihot } from "../site/src/lib/news.mjs";

const DEFAULT_OUT = resolve("data/news/aihot.json");

function parseOut(argv) {
  const flag = argv.indexOf("--out");
  if (flag >= 0 && argv[flag + 1]) return resolve(argv[flag + 1]);
  return DEFAULT_OUT;
}

async function readPrevious(file) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(raw?.items) ? raw : undefined;
  } catch {
    return undefined;
  }
}

const out = parseOut(process.argv.slice(2));
const previous = await readPrevious(out);
const feed = await collectAihot({ previous });
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(feed, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ out, count: feed.count, error: feed.error ?? null })}\n`);
if (feed.error && feed.count === 0) process.exit(1);
