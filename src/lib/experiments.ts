// Playground experiment index. Entries live in code on purpose: they change together with the
// pages they link to, so they are not synced to R2 (see README §7).

export interface Experiment {
  id: string;
  title: string;
  description: string;
  href: string;
  status: string;
  /** Index keywords: shown on the row and matched by search. */
  tags: string[];
}

export const experiments: Experiment[] = [
  {
    id: 'focus',
    title: '聚焦练习',
    description: '限时六十秒，点中不断出现的小球。记录反应时间与命中率，看看自己能稳定到什么程度。',
    href: '/fun/focus',
    status: '可玩',
    tags: ['限时', '反应时间', '统计', '触摸'],
  },
  {
    id: 'answerbook',
    title: '答案之书',
    description: '写下一个问题，翻到随机的一页。未必有用，但值得看一眼。',
    href: '/fun/answerbook',
    status: '可玩',
    tags: ['随机', '文字', 'UAPI', '实时接口'],
  },
];

/** The text a search is matched against: title, description and every tag. */
export function searchText(item: Experiment): string {
  return [item.title, item.description, ...item.tags].join(' ');
}

/**
 * Case-insensitive match. The query is split on whitespace and every token must appear
 * somewhere in the text, so "限时 统计" finds entries that have both. A blank query matches all.
 */
export function matchesQuery(text: string, query: string): boolean {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = text.toLocaleLowerCase();
  return tokens.every((token) => haystack.includes(token));
}
