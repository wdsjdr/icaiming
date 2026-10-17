import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAaItems, parseAaName, summarizeAa, type AaRaw } from '../workers/aggregator/src/sources/aa';

function model(over: Record<string, unknown>): AaRaw {
  return {
    id: 'x',
    name: 'X',
    slug: 'x',
    release_date: '2026-01-01',
    model_creator: { name: 'Acme' },
    evaluations: {},
    artificial_analysis_intelligence_index_cost: {},
    pricing: {},
    ...over,
  } as unknown as AaRaw;
}

test('parseAaName strips only recognized effort suffixes', () => {
  assert.deepEqual(parseAaName('GPT-6 Sol (max)'), {
    base: 'GPT-6 Sol', mode: null, effort: 'max', fallback: false, known: true,
  });
  assert.deepEqual(parseAaName('Claude Sonnet 5.5 (Max, Default Fallback)'), {
    base: 'Claude Sonnet 5.5', mode: null, effort: 'max', fallback: true, known: true,
  });
  const adaptive = parseAaName('GPT-5.6 Terra (Adaptive Reasoning, Max Effort)');
  assert.equal(adaptive.base, 'GPT-5.6 Terra');
  assert.equal(adaptive.mode, 'reasoning');
  assert.equal(adaptive.effort, 'max');
  assert.equal(parseAaName('GLM-4.5V (Non-reasoning)').mode, 'non-reasoning');
  assert.equal(parseAaName('Grok 4.7 (xhigh)').effort, 'xhigh');
});

test('parseAaName keeps unknown or absent suffixes in the base name', () => {
  const dated = parseAaName("Gemini 2.0 Flash Thinking Experimental (Jan '25)");
  assert.equal(dated.base, "Gemini 2.0 Flash Thinking Experimental (Jan '25)");
  assert.equal(dated.known, false);
  assert.equal(dated.effort, null);
  const bare = parseAaName('Mercury 2');
  assert.equal(bare.base, 'Mercury 2');
  assert.equal(bare.known, false);
});

test('buildAaItems groups variants and picks the best configuration', () => {
  const items = buildAaItems([
    model({
      id: 'max', name: 'GPT-6 Sol (max)', slug: 'gpt-6-sol-max',
      evaluations: { artificial_analysis_intelligence_index: 47.6 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 1.05 } },
    }),
    model({
      id: 'low', name: 'GPT-6 Sol (low)', slug: 'gpt-6-sol-low',
      evaluations: { artificial_analysis_intelligence_index: 34.2 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 0.13 } },
    }),
    model({
      id: 'nr', name: 'GPT-6 Sol (Non-reasoning)', slug: 'gpt-6-sol-nr',
      evaluations: { artificial_analysis_intelligence_index: 28.5 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 0.33 } },
    }),
  ]);
  assert.equal(items.filter((item) => item.isBestConfig).length, 1);
  const best = items.find((item) => item.isBestConfig)!;
  assert.equal(best.slug, 'gpt-6-sol-max');
  assert.equal(best.baseName, 'GPT-6 Sol');
  assert.equal(best.isMax, true);
  assert.equal(items.filter((item) => item.isMax).length, 1);
});

test('buildAaItems does not merge models with unknown suffixes', () => {
  const items = buildAaItems([
    model({ id: 'a', name: 'Gemini 2.5 Pro Preview', slug: 'a' }),
    model({ id: 'b', name: "Gemini 2.5 Pro Preview (May' 25)", slug: 'b' }),
  ]);
  assert.equal(items.filter((item) => item.isBestConfig).length, 2);
});

test('buildAaItems treats free models as valid cheapest points', () => {
  const items = buildAaItems([
    model({
      id: 'free', name: 'Free (max)', slug: 'free',
      evaluations: { artificial_analysis_intelligence_index: 20 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 0 } },
    }),
    model({
      id: 'cheap', name: 'Cheap (max)', slug: 'cheap',
      evaluations: { artificial_analysis_intelligence_index: 30 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 0.5 } },
    }),
    model({
      id: 'mid', name: 'Mid (max)', slug: 'mid',
      evaluations: { artificial_analysis_intelligence_index: 25 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 1 } },
    }),
    model({
      id: 'premium', name: 'Premium (max)', slug: 'premium',
      evaluations: { artificial_analysis_intelligence_index: 40 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 5 } },
    }),
  ]);
  const free = items.find((item) => item.slug === 'free')!;
  assert.equal(free.costPerTask, 0);
  assert.equal(free.isEfficiencyFrontier, true);
  assert.equal(items.find((item) => item.slug === 'cheap')!.isEfficiencyFrontier, true);
  assert.equal(items.find((item) => item.slug === 'mid')!.isEfficiencyFrontier, false);
  assert.equal(items.find((item) => item.slug === 'premium')!.isEfficiencyFrontier, true);
});

test('buildAaItems breaks intelligence ties by lower cost', () => {
  const items = buildAaItems([
    model({
      id: 'slow', name: 'T (max)', slug: 't-max',
      evaluations: { artificial_analysis_intelligence_index: 30 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 2 } },
    }),
    model({
      id: 'fast', name: 'T (high)', slug: 't-high',
      evaluations: { artificial_analysis_intelligence_index: 30 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 1 } },
    }),
  ]);
  assert.equal(items.find((item) => item.isBestConfig)!.slug, 't-high');
});

test('summarizeAa reports medians over best configurations', () => {
  const items = buildAaItems([
    model({
      id: 'a', name: 'A (max)', slug: 'a',
      evaluations: { artificial_analysis_intelligence_index: 10 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 0 } },
    }),
    model({
      id: 'b', name: 'B (max)', slug: 'b',
      evaluations: { artificial_analysis_intelligence_index: 20 },
      artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: 2 } },
    }),
    model({
      id: 'c', name: 'C (max)', slug: 'c',
      evaluations: { artificial_analysis_intelligence_index: 30 },
    }),
  ]);
  const stats = summarizeAa(items);
  assert.equal(stats.models, 3);
  assert.equal(stats.baseModels, 3);
  assert.equal(stats.costModels, 2);
  assert.equal(stats.medianIntelligence, 20);
  assert.equal(stats.costMedianIntelligence, 15);
});
