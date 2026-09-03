export {
  demandsByLane,
  getDemandById,
  getDemands,
  getDemandsFeed,
  xianyuConfidenceLabel,
  xianyuKindLabel,
  xianyuLane,
  xianyuLaneLabel,
  xianyuStatusClass,
  xianyuStatusLabel,
} from "./xianyu.mjs";

export type XianyuKind = "want" | "service" | "account" | "course" | "goods" | "other";
export type XianyuConfidence = "high" | "medium" | "low";
export type XianyuStatus = "emerging" | "hot" | "stable" | "cooling";
export type XianyuLane = "trend" | "hot";

export type XianyuDemand = {
  id: string;
  title: string;
  kind: XianyuKind | string;
  score: number;
  confidence: XianyuConfidence | string;
  status: XianyuStatus | string;
  lane?: XianyuLane | string;
  price: string;
  category: string;
  tags: string[];
  summary: string;
  why_it_matters: string;
  url: string;
  first_detected: string;
  last_updated: string;
};

export type XianyuSummary = {
  top_demands: string[];
  price_bands: string[];
  gaps: string[];
  trend_highlights: string[];
  hot_highlights: string[];
};

export type XianyuFeed = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  summary: XianyuSummary;
  items: XianyuDemand[];
};
