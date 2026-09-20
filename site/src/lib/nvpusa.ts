export {
  avatarSrc,
  coverSrc,
  defaultSortForFilter,
  filterArchive,
  filterCounts,
  FILTERS,
  formatFollowers,
  getArchive,
  isLocalMedia,
  isLost,
  isVerified,
  itemFromCard,
  matchesFilter,
  matchesSearch,
  profileUrl,
  snippet,
  sortItems,
} from "./nvpusa.mjs";

export type NvpusaFilterId = "all" | "hot" | "verified" | "top" | "100k" | "recent" | "lost";
export type NvpusaSortId = "followers" | "clicks" | "recent" | "name";

export type NvpusaItem = {
  id: string;
  screen_name: string;
  name: string;
  avatar_url?: string;
  cover_url?: string;
  followers_count?: number;
  description?: string;
  verified?: 0 | 1 | boolean;
  backed_up_at?: string;
  is_blocked?: 0 | 1;
  is_suspended?: 0 | 1 | 2;
  clicks_card?: number;
  clicks_timeline?: number;
  clicks_roulette?: number;
  total_clicks?: number;
  last_synced_at?: string;
};
