import { runRankings, runHotboard, runEpic, runSaying, runDailyNews } from './tasks';
import type { Env, TaskResult } from './types';

export type Task = (env: Env) => Promise<TaskResult>;

// Cron expression → tasks. Keys must match [triggers] crons in wrangler.toml
// (enforced by tests/aggregator-schedule.test.ts). Times are UTC.
export const schedule = new Map<string, Task[]>([
  ['0 */6 * * *', [runRankings, runHotboard]],
  ['0 1 * * *', [runDailyNews, runEpic]],
  ['30 1 * * *', [runSaying]],
  ['0 5 * * *', [runDailyNews]], // daily-news compensation: skipped when today's image already exists
]);

// Names accepted by GET /run?task=<name>.
export const tasksByName = new Map<string, Task>([
  ['rankings', runRankings],
  ['hotboard', runHotboard],
  ['daily-news', runDailyNews],
  ['epic', runEpic],
  ['saying', runSaying],
]);

async function run(tasks: Task[], env: Env): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (const task of tasks) {
    try { results.push(await task(env)); }
    catch (error) { console.error('[aggregator]', error); results.push({ task: task.name, ok: 0, failed: 1 }); }
  }
  return results;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

// Compares SHA-256 digests in constant time so the token length and prefix are not leaked.
export async function isAuthorized(request: Request, expected: string): Promise<boolean> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '');
  if (!match) return false;
  const [given, wanted] = await Promise.all([digest(match[1]), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < wanted.length; i++) diff |= given[i] ^ wanted[i];
  return diff === 0;
}

const text = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const tasks = schedule.get(controller.cron);
    if (!tasks) {
      console.warn(`[aggregator] no tasks configured for cron "${controller.cron}"`);
      return;
    }
    ctx.waitUntil(run(tasks, env).then((results) => console.log('[aggregator]', controller.cron, JSON.stringify(results))));
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname !== '/run') return text('IC Aiming aggregator. Use GET /run?task=<name> with a Bearer token.');
    if (request.method !== 'GET') return text('Method Not Allowed', 405, { Allow: 'GET' });
    if (!env.RUN_TOKEN) return text('RUN_TOKEN is not configured', 503);
    if (!(await isAuthorized(request, env.RUN_TOKEN))) return text('Unauthorized', 401, { 'WWW-Authenticate': 'Bearer' });
    const name = url.searchParams.get('task');
    if (!name) return text(`Missing task. Allowed: ${[...tasksByName.keys()].join(', ')}`, 400);
    const task = tasksByName.get(name);
    if (!task) return text(`Unknown task "${name}". Allowed: ${[...tasksByName.keys()].join(', ')}`, 400);
    return Response.json(await run([task], env));
  },
};
