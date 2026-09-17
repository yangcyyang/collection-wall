export {
  categoryFilters,
  getThinkingFeed,
  getThinkingMethods,
  matchesThinking,
  thinkingSearchBlob,
} from "./thinking.mjs";

export type ThinkingItem = {
  id: string;
  name: string;
  name_en?: string;
  category: string;
  one_liner?: string;
  how?: string;
  example?: string;
  tags?: string[];
};

export type ThinkingFeed = {
  source: string;
  title: string;
  description: string;
  updated_at: string;
  count: number;
  categories: string[];
  items: ThinkingItem[];
};
