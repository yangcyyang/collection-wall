export {
  categoryFilters,
  categoryLabel,
  formatBeijingDateTime,
  getNewsFeed,
} from "./news.mjs";

export type NewsLinks = {
  aihot: string;
  original: string;
};

export type NewsItem = {
  id: string;
  title: string;
  category: string;
  source: string;
  published_at: string;
  discovered_at: string;
  summary: string;
  reason: string;
  links: NewsLinks;
};

export type NewsDaily = {
  date: string;
  title: string;
  url: string;
};

export type NewsFeed = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  items: NewsItem[];
  daily?: NewsDaily;
  error?: string;
};

