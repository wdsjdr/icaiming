import { sleep, uapi } from '../http';
import type { Env } from '../types';

async function fetchOne(env: Env): Promise<string> {
  const data = await uapi<{ text?: string }>(env, '/saying', 8000);
  return (data.text ?? '').trim();
}

export async function fetchSayings(env: Env, count: number): Promise<string[]> {
  const items = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (index > 0) await sleep(320 + Math.random() * 120);
    let text = '';
    for (let attempt = 0; attempt < 3 && !text; attempt++) {
      if (attempt > 0) await sleep(800 * attempt);
      try { text = await fetchOne(env); }
      catch (error) { if (attempt === 2) console.error('[saying]', error); }
    }
    if (text) items.add(text);
  }
  return [...items];
}

export function mergePool(existing: string[] | undefined, incoming: string[], cap = 60): string[] {
  const pool = new Set<string>();
  for (const item of existing ?? []) { const value = item.trim(); if (value) pool.add(value); }
  for (const item of incoming) { const value = item.trim(); if (value) pool.add(value); }
  const all = [...pool];
  return all.length > cap ? all.slice(all.length - cap) : all;
}