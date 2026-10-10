import type { PagesFunction } from '@cloudflare/workers-types';
import { errorResponse, HttpError, type Env } from '../../src/server/r2';
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const question = (new URL(request.url).searchParams.get('q') ?? '').trim();
    if (!question) throw new HttpError(400, '请先写下你的问题');
    if (question.length > 100) throw new HttpError(400, '问题有点长，精简一点再问');
    const headers: Record<string, string> = { 'User-Agent': 'ic-aiming/1.0 (+https://github.com/wdsjdr/icaiming)' };
    if (env.UAPI_KEY) headers.Authorization = `Bearer ${env.UAPI_KEY}`;
    const response = await fetch(`https://uapis.cn/api/v1/answerbook/ask?question=${encodeURIComponent(question)}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new HttpError(502, '答案之书暂时沉默，稍后再问一次');
    const data = await response.json() as { question?: string; answer?: string };
    if (!data.answer) throw new HttpError(502, '答案之书暂时沉默，稍后再问一次');
    return Response.json({ question: data.question ?? question, answer: data.answer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
};