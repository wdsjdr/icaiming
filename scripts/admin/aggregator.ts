// Pure helpers for the admin page's manual aggregator actions. No filesystem or global state here,
// so the behaviour can be unit-tested without starting the admin server.

export const AGGREGATOR_TASKS = ['rankings', 'hotboard', 'daily-news', 'epic', 'saying'] as const;
export type AggregatorTask = (typeof AGGREGATOR_TASKS)[number];

export const DEFAULT_AGGREGATOR_URL = 'https://ic-aiming-aggregator.3043927908.workers.dev';

// How long a manual run may wait for the Worker. Scheduled runs are not affected.
export const RUN_TIMEOUT_MS = 2 * 60 * 1000;
export const VERIFY_TIMEOUT_MS = 15 * 1000;

export class AggregatorConfigError extends Error {}

// AGGREGATOR_URL overrides the default Worker origin. Only the origin is kept: the Worker serves /run at its root.
export function aggregatorBase(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.AGGREGATOR_URL || DEFAULT_AGGREGATOR_URL).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AggregatorConfigError(`AGGREGATOR_URL 不是合法地址：${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AggregatorConfigError('AGGREGATOR_URL 必须以 http:// 或 https:// 开头');
  if (url.pathname !== '/' && url.pathname !== '') throw new AggregatorConfigError('AGGREGATOR_URL 只能是域名或源，不能带路径');
  return url.origin;
}

export function isAggregatorTask(value: unknown): value is AggregatorTask {
  return typeof value === 'string' && (AGGREGATOR_TASKS as readonly string[]).includes(value);
}

export function buildRunUrl(base: string, task?: string): string {
  const url = new URL('/run', base);
  if (task !== undefined) url.searchParams.set('task', task);
  return url.toString();
}

// Maps the Worker's /run status to a Chinese message. Returns null when the run was accepted.
export function describeRunStatus(status: number): string | null {
  if (status >= 200 && status < 300) return null;
  if (status === 400) return '聚合 Worker 拒绝了该任务参数（Worker 版本可能与管理页不一致）';
  if (status === 401) return 'RUN_TOKEN 不匹配，请重新输入';
  if (status === 503) return '聚合 Worker 尚未设置 RUN_TOKEN，请先在「概览 → Cloudflare 部署」中设置';
  if (status === 405) return '聚合 Worker 不接受该请求方法';
  return `聚合 Worker 返回 ${status}`;
}

// A request without ?task= is used only to check the token: 400 means the token is accepted and no task ran.
export function describeVerifyStatus(status: number): string | null {
  if (status === 400) return null;
  if (status === 401) return 'RUN_TOKEN 不正确';
  if (status === 503) return '聚合 Worker 尚未设置 RUN_TOKEN，请先在「概览 → Cloudflare 部署」中设置';
  return `聚合 Worker 返回 ${status}，无法验证`;
}

export function describeNetworkError(error: unknown): string {
  const name = (error as Error | undefined)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return '聚合 Worker 超过 2 分钟未返回。任务可能仍在 Cloudflare 上执行，可稍后查看 R2 中的更新时间';
  }
  return `无法连接聚合 Worker：${(error as Error | undefined)?.message ?? String(error)}`;
}

// Calls the Worker with the token in the Authorization header only (never in the URL, so it stays out of logs).
export async function callAggregator(options: {
  base: string; token: string; task?: AggregatorTask; timeoutMs: number;
}): Promise<Response> {
  return fetch(buildRunUrl(options.base, options.task), {
    method: 'GET',
    headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(options.timeoutMs),
  });
}
