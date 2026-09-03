export {
  flattenSectionItems,
  getRadarFeed,
  getRecentReportDates,
  getSectionItems,
  getXiaohongshuItemById,
  hasReportContent,
  SECTION_KEYS,
  SECTION_LABELS,
  xiaohongshuDirectionClass,
  xiaohongshuDirectionLabel,
  xiaohongshuSignalClass,
  xiaohongshuSignalLabel,
} from "./xiaohongshu.mjs";

export type XiaohongshuDirection = "up_fast" | "up" | "flat" | "down" | "new";
export type XiaohongshuSignal = "strong" | "mid" | "weak";

export type XiaohongshuEvidence = {
  url?: string;
  title?: string;
  note?: string;
};

export type XiaohongshuItem = {
  id: string;
  title: string;
  summary: string;
  why?: string;
  audience?: string;
  direction?: XiaohongshuDirection | string;
  price?: string;
  tags?: string[];
  signal_strength?: XiaohongshuSignal | string;
  evidence?: XiaohongshuEvidence[];
  first_detected?: string;
  last_updated?: string;
  section?: string;
  key?: string;
};

export type XiaohongshuSummary = {
  today_judgement: string[];
  top_signals: string[];
};

export type XiaohongshuAwareness = {
  dominant_level: string;
  fastest_growing: string;
  note: string;
};

export type XiaohongshuSections = {
  hot: XiaohongshuItem[];
  trends: XiaohongshuItem[];
  needs: XiaohongshuItem[];
  pains: XiaohongshuItem[];
  scenarios: XiaohongshuItem[];
  products: XiaohongshuItem[];
  content_opps: XiaohongshuItem[];
  product_opps: XiaohongshuItem[];
  biz_opps: XiaohongshuItem[];
  quotes: XiaohongshuItem[];
};

export type XiaohongshuFeed = {
  source: string;
  title: string;
  date: string;
  updated_at: string;
  count: number;
  summary: XiaohongshuSummary;
  sections: XiaohongshuSections;
  awareness: XiaohongshuAwareness;
};
