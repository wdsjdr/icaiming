// Pure helpers for the admin page's manual aggregator actions. No filesystem or global state here,
// so the behaviour can be unit-tested without starting the admin server.

export const AGGREGATOR_TASKS = ['rankings', 'hotboard', 'daily-news', 'epic', 'saying', 'aa-models'] as const;
export type AggregatorTask = (typeof AGGREGATOR_TASKS)[number];

export const DEFAULT_AGGREGATOR_URL = 'https://ic-aiming-aggregator.3043927908.workers.dev';

// How long a manual run may wait for the Worker. Scheduled runs are not affected.
export const RUN_TIMEOUT_MS = 2 * 60 * 1000;
export const VERIFY_TIMEOUT_MS = 15 * 1000;

export class AggregatorConfigError extends Error {}

export interface ProxySetting { url: string; source: string }

// Minimal dotenv reader: KEY=VALUE per line, optional quotes, no interpolation.
export function parseDotenv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

// Accepts "127.0.0.1:7897" as well as full URLs. undici's proxy agent only speaks HTTP(S) proxies.
export function normalizeProxyUrl(raw: string): string {
  const text = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new AggregatorConfigError(`代理地址不合法：${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AggregatorConfigError('代理只支持 http:// 或 https://');
  return url.toString().replace(/\/$/, '');
}

// Credentials never reach the page or the log: only scheme, host and port are shown.
export function maskProxy(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

// Precedence: process environment, then icaiming/.env. Returns null for a direct connection.
export function resolveProxy(processEnv: NodeJS.ProcessEnv, dotenv: Record<string, string>): ProxySetting | null {
  const fromEnv = processEnv.HTTPS_PROXY || processEnv.https_proxy || processEnv.HTTP_PROXY || processEnv.http_proxy;
  if (fromEnv) return { url: normalizeProxyUrl(fromEnv), source: '环境变量' };
  const fromFile = dotenv.HTTPS_PROXY || dotenv.HTTP_PROXY;
  if (fromFile) return { url: normalizeProxyUrl(fromFile), source: 'icaiming/.env' };
  return null;
}

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

// `proxy` is the display form of the outbound proxy in use (no credentials), or null for a direct connection.
export function describeNetworkError(error: unknown, proxy: string | null): string {
  const name = (error as Error | undefined)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return '聚合 Worker 超过 2 分钟未返回。任务可能仍在 Cloudflare 上执行，可稍后查看 R2 中的更新时间';
  }
  const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
  const code = cause?.code ?? '';
  const detail = `${(error as Error | undefined)?.message ?? String(error)}${code ? `（${code}）` : ''}`;
  const unreachable = ['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(code);
  let hint = '';
  if (unreachable && proxy) hint = `。当前经代理 ${proxy} 连接，请确认代理软件正在运行`;
  else if (unreachable) hint = '。本机未配置代理：若直连 Cloudflare 不通，请在 icaiming/.env 中加入 HTTPS_PROXY=http://127.0.0.1:7897（端口按你的代理软件），然后重启 pnpm admin';
  return `无法连接聚合 Worker：${detail}${hint}`;
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
