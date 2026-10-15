import type { R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  CONTENT_BUCKET: R2Bucket;
  UAPI_KEY?: string;
  RUN_TOKEN?: string;
  STEAM_API_BASE?: string;
  HOTBOARD_PLATFORMS?: string;
  HOTBOARD_LIMIT?: string;
  SAYING_COUNT?: string;
  SAYING_POOL?: string;
  NEWS_RETENTION_DAYS?: string;
}

export interface RawItem {
  key: string;
  name: string;
  vendor?: string;
  raw: number;
  url?: string;
  tags: string[];
}

export interface SourcedItem extends RawItem { source: string }

export interface RankingItem {
  rank: number;
  name: string;
  vendor?: string;
  score: number;
  raw?: number;
  sources: Record<string, number>;
  url?: string;
  tags: string[];
}

export interface CombinedRanking {
  updatedAt: string;
  weights: Record<string, number>;
  items: RankingItem[];
}

export interface Source {
  name: string;
  fetch(): Promise<RawItem[]>;
}

export interface TaskResult { task: string; ok: number; failed: number; skipped?: boolean }