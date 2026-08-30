export {
  emergingSignals,
  getProductById,
  getProducts,
  getProductsFeed,
  getSignalById,
  getSignals,
  getSignalsFeed,
  getWatchlist,
  getWatchlistById,
  getWatchlistFeed,
  homepageProducts,
  homepageSignals,
  radarConfidenceLabel,
  radarStatusClass,
  radarStatusLabel,
  relatedSignalLabels,
  sortEvidenceByDate,
} from "./radar.mjs";

export type RadarStatus =
  | "new"
  | "watching"
  | "strengthening"
  | "weakening"
  | "confirmed_trend"
  | "closed";

export type RadarEvidence = {
  url: string;
  source?: string;
  note?: string;
  date?: string;
};

export type RadarJudgmentChange = {
  date: string;
  change: string;
};

export type RadarSignal = {
  id: string;
  title: string;
  type: string;
  score: number;
  confidence: string;
  status: RadarStatus | string;
  first_detected: string;
  last_updated: string;
  summary: string;
  why_it_matters: string;
  tags: string[];
  evidence: RadarEvidence[];
  watch_next: string[];
  homepage?: boolean;
  judgment_changes?: RadarJudgmentChange[];
};

export type RadarProduct = {
  id: string;
  name: string;
  score: number;
  status: RadarStatus | string;
  first_detected: string;
  last_updated: string;
  summary: string;
  novelty: string;
  urls: Record<string, string>;
  tags: string[];
  homepage?: boolean;
};

export type RadarWatchItem = {
  id: string;
  title: string;
  why: string;
  since: string;
  last_updated: string;
  status: RadarStatus | string;
  related_signals?: string[];
};

export type RadarFeed<T> = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  items: T[];
};
