import { runRankings, runHotboard, runEpic, runSaying, runDailyNews } from './tasks';
import type { Env, TaskResult } from './types';

type Task = (env: Env) => Promise<TaskResult>;
// Free plan allows up to 5 cron triggers per Worker. Keep the count low by grouping tasks:
// two triggers total, so future sources do not need a new trigger.
const schedule: Record<string, Task[]> = {
  '0 */6 * * *': [runRankings, runHotboard],
  '0 1 * * *': [runDailyNews, runEpic, runSaying],
};
const all: Task[] = Object.values(schedule).flat();

async function run(tasks: Task[], env: Env): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (const task of tasks) {
    try { results.push(await task(env)); }
    catch (error) { console.error('[aggregator]', error); results.push({ task: task.name, ok: 0, failed: 1 }); }
  }
  return results;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(schedule[controller.cron] ?? all, env));
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/run') return Response.json(await run(all, env));
    return new Response('IC Aiming aggregator. GET /run to refresh all tasks.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};