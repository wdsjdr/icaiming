import type { Env } from '../types';

const AA_BASE = 'https://artificialanalysis.ai/api/v2/language/models/free';
const AA_SITE = 'https://artificialanalysis.ai';

const MODES = new Set(['non-reasoning', 'reasoning', 'adaptive reasoning']);
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const FALLBACK = new Set(['default fallback']);

export interface AaRaw {
  id?: string;
  name?: string;
  slug?: string;
  release_date?: string | null;
  model_creator?: { id?: string; name?: string } | null;
  evaluations?: { artificial_analysis_intelligence_index?: number | null } | null;
  artificial_analysis_intelligence_index_cost?: {
    total_cost?: number | null;
    cost_per_task?: { total_cost?: number | null } | null;
  } | null;
  pricing?: {
    price_1m_input_tokens?: number | null;
    price_1m_output_tokens?: number | null;
  } | null;
}

export interface ParsedAaName {
  base: string;
  mode: string | null;
  effort: string | null;
  fallback: boolean;
  known: boolean;
}

export interface AaModelItem {
  slug: string;
  name: string;
  baseName: string;
  baseKey: string;
  creator: string;
  effort: string | null;
  mode: string | null;
  fallback: boolean;
  isMax: boolean;
  isBestConfig: boolean;
  isEfficiencyFrontier: boolean;
  intelligence: number | null;
  costPerTask: number | null;
  priceInput: number | null;
  priceOutput: number | null;
  releaseDate: string | null;
  sourceUrl: string;
}

export interface AaStats {
  models: number;
  baseModels: number;
  costModels: number;
  medianIntelligence: number | null;
  costMedianIntelligence: number | null;
}

/**
 * Only strip a trailing parenthetical when every comma-separated token is a
 * known reasoning level/mode. Anything else (dates, Preview, Vision, …) stays
 * in the base name so different model versions are never merged.
 */
export function parseAaName(raw: string): ParsedAaName {
  const name = String(raw ?? '').trim();
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name);
  if (!match) return { base: name, mode: null, effort: null, fallback: false, known: false };

  const tokens = match[2].split(',').map((token) => token.trim().toLowerCase()).filter(Boolean);
  let mode: string | null = null;
  let effort: string | null = null;
  let fallback = false;
  let known = tokens.length > 0;

  for (const token of tokens) {
    if (MODES.has(token)) {
      mode = token === 'non-reasoning' ? 'non-reasoning' : 'reasoning';
    } else if (EFFORTS.has(token)) {
      effort = token;
    } else if (token === 'max effort') {
      effort = 'max';
    } else if (FALLBACK.has(token)) {
      fallback = true;
    } else {
      known = false;
    }
  }

  if (!known) return { base: name, mode: null, effort: null, fallback: false, known: false };
  return { base: match[1].trim(), mode, effort, fallback, known: true };
}

const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Turn the AA free-tier rows into a flat, grouped list with ETL flags. */
export function buildAaItems(models: AaRaw[]): AaModelItem[] {
  const items: AaModelItem[] = models.map((model) => {
    const parsed = parseAaName(String(model.name ?? ''));
    const creator = String(model.model_creator?.name ?? '').trim();
    const cost = model.artificial_analysis_intelligence_index_cost;
    const slug = String(model.slug ?? model.id ?? '').trim();
    return {
      slug,
      name: String(model.name ?? '').trim(),
      baseName: parsed.base,
      baseKey: parsed.base.toLowerCase(),
      creator,
      effort: parsed.effort,
      mode: parsed.mode,
      fallback: parsed.fallback,
      isMax: parsed.effort === 'max',
      isBestConfig: false,
      isEfficiencyFrontier: false,
      intelligence: num(model.evaluations?.artificial_analysis_intelligence_index),
      costPerTask: num(cost?.cost_per_task?.total_cost),
      priceInput: num(model.pricing?.price_1m_input_tokens),
      priceOutput: num(model.pricing?.price_1m_output_tokens),
      releaseDate: model.release_date ?? null,
      sourceUrl: slug ? `${AA_SITE}/models/${encodeURIComponent(slug)}` : AA_SITE,
    };
  }).filter((item) => item.name && item.slug);

  // One "best config" per creator + base model: highest intelligence, then cheaper.
  const groups = new Map<string, AaModelItem[]>();
  for (const item of items) {
    const key = `${item.creator.toLowerCase()}||${item.baseKey}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  for (const group of groups.values()) {
    const ranked = [...group]
      .filter((item) => item.intelligence != null)
      .sort((a, b) => (b.intelligence ?? 0) - (a.intelligence ?? 0) || (a.costPerTask ?? Infinity) - (b.costPerTask ?? Infinity));
    (ranked[0] ?? group[0]).isBestConfig = true;
  }

  // Pareto frontier on the best-config set: more intelligence than every cheaper model.
  const priced = items
    .filter((item) => item.isBestConfig && item.costPerTask != null)
    .sort((a, b) => (a.costPerTask ?? 0) - (b.costPerTask ?? 0) || (b.intelligence ?? -1) - (a.intelligence ?? -1));
  let maxIntelligence = -Infinity;
  for (const item of priced) {
    if (item.intelligence != null && item.intelligence > maxIntelligence) {
      item.isEfficiencyFrontier = true;
      maxIntelligence = item.intelligence;
    }
  }

  return items.sort((a, b) =>
    (b.intelligence ?? -1) - (a.intelligence ?? -1) ||
    a.name.localeCompare(b.name) ||
    a.slug.localeCompare(b.slug));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeAa(items: AaModelItem[]): AaStats {
  const best = items.filter((item) => item.isBestConfig);
  const bestPriced = best.filter((item) => item.costPerTask != null);
  return {
    models: items.length,
    baseModels: best.length,
    costModels: bestPriced.length,
    medianIntelligence: median(best.map((item) => item.intelligence).filter((v): v is number => v != null)),
    costMedianIntelligence: median(bestPriced.map((item) => item.intelligence).filter((v): v is number => v != null)),
  };
}

/** Fetch every page of the AA free endpoint and build the leaderboard payload. */
export async function fetchAaModels(env: Env): Promise<{ items: AaModelItem[]; stats: AaStats }> {
  if (!env.AA_API_KEY) throw new Error('AA_API_KEY 未配置');

  const rows: AaRaw[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`${AA_BASE}?page=${page}`, {
      headers: { 'x-api-key': env.AA_API_KEY, accept: 'application/json' },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`AA API ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    const body = await response.json() as { data?: AaRaw[]; pagination?: { has_more?: boolean } } | AaRaw[];
    const pageRows = Array.isArray(body) ? body : body.data ?? [];
    rows.push(...pageRows);
    const hasMore = Array.isArray(body) ? pageRows.length >= 200 : body.pagination?.has_more ?? pageRows.length >= 200;
    if (!pageRows.length || !hasMore) break;
  }

  const items = buildAaItems(rows);
  return { items, stats: summarizeAa(items) };
}
