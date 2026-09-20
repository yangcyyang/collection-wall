import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  avatarSrc,
  coverSrc,
  defaultSortForFilter,
  filterArchive,
  filterCounts,
  FILTERS,
  formatFollowers,
  isLocalMedia,
  isLost,
  isVerified,
  itemFromCard,
  matchesFilter,
  matchesSearch,
  profileUrl,
  snippet,
  sortItems,
} from "./nvpusa-filter.mjs";

export async function getArchive(target = resolve(process.cwd(), "../data/nvpusa/archive.local.json")) {
  try {
    const raw = JSON.parse(await readFile(target, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export {
  avatarSrc,
  coverSrc,
  defaultSortForFilter,
  filterArchive,
  filterCounts,
  FILTERS,
  formatFollowers,
  isLocalMedia,
  isLost,
  isVerified,
  itemFromCard,
  matchesFilter,
  matchesSearch,
  profileUrl,
  snippet,
  sortItems,
};
