import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

const defaultArchive = fileURLToPath(new URL("../../../data/nvpusa/archive.local.json", import.meta.url));

export async function getArchive(target = defaultArchive) {
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
