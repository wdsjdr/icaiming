import type { Env } from '../types';

const ENDPOINT = 'https://uapis.cn/api/v1/daily/news-image';
const USER_AGENT = 'ic-aiming-aggregator/1.0 (+https://github.com/wdsjdr/icaiming)';

export interface DailyNewsImage { bytes: ArrayBuffer; contentType: string }

export async function fetchDailyNewsImage(env: Env): Promise<DailyNewsImage> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/*' };
  if (env.UAPI_KEY) headers.Authorization = `Bearer ${env.UAPI_KEY}`;
  // Real-time scraping + rendering can take several seconds; allow a generous timeout.
  const response = await fetch(ENDPOINT, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`UAPI 每日新闻返回 ${response.status}`);
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error(`每日新闻返回了非图片内容：${contentType}`);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('每日新闻图片为空');
  return { bytes, contentType };
}