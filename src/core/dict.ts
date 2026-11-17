/**
 * 自定义词表匹配。用 Aho-Corasick 一次扫描找出全部命中，
 * 避免「每个词都 indexOf 一遍」在长文档上的 O(n·m) 开销。
 */

import type { DictEntry } from '../types';

export interface DictMatch {
  start: number;
  end: number;
  pattern: string;
}

export function findDictMatches(text: string, patterns: string[]): DictMatch[] {
  const usable = Array.from(new Set(patterns.filter((p) => p.trim().length >= 2)));
  if (usable.length === 0 || text.length === 0) return [];

  const next: Array<Map<string, number>> = [new Map()];
  const fail: number[] = [0];
  const out: string[][] = [[]];

  const newNode = () => {
    next.push(new Map());
    fail.push(0);
    out.push([]);
    return next.length - 1;
  };

  for (const p of usable) {
    let cur = 0;
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      let nx = next[cur].get(ch);
      if (nx === undefined) {
        nx = newNode();
        next[cur].set(ch, nx);
      }
      cur = nx;
    }
    if (!out[cur].includes(p)) out[cur].push(p);
  }

  // BFS 构建 fail 指针，并把失配链上的输出合并下来（否则会漏掉后缀匹配）
  const queue: number[] = [];
  for (const [, v] of next[0]) {
    fail[v] = 0;
    queue.push(v);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    for (const [ch, v] of next[u]) {
      let f = fail[u];
      while (f !== 0 && !next[f].has(ch)) f = fail[f];
      const cand = next[f].get(ch);
      fail[v] = cand !== undefined && cand !== v ? cand : 0;
      if (fail[v] !== 0) {
        for (const o of out[fail[v]]) {
          if (!out[v].includes(o)) out[v].push(o);
        }
      }
      queue.push(v);
    }
  }

  const res: DictMatch[] = [];
  let cur = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    while (cur !== 0 && !next[cur].has(ch)) cur = fail[cur];
    const nx = next[cur].get(ch);
    cur = nx !== undefined ? nx : 0;
    if (out[cur].length > 0) {
      for (const p of out[cur]) {
        const start = i + 1 - p.length;
        if (start >= 0) res.push({ start, end: i + 1, pattern: p });
      }
    }
  }
  return res;
}

/** 名称里出现这些词，基本可以断定是机构而非自然人。 */
const ORG_HINT =
  /(公司|集团|银行|基金|证券|保险|信托|资管|租赁|控股|实业|科技|投资|管理|贸易|建设|工程|中心|研究院|研究所|事务所|合作社|学校|医院|协会|委员会|工厂|商行|酒店|地产|置业)/;

export function inferType(name: string): DictEntry['type'] {
  if (/^[\u4e00-\u9fa5]{2,4}$/.test(name) && !ORG_HINT.test(name)) return '人名';
  return '机构';
}

/** 项目/工程/计划类名称的典型结尾。 */
const PROJECT_HINT = /(项目|工程|计划|课题|工程建设项目|专项|基金|工程总承包)$/;

/**
 * 给「从正文选中一段文字加入词表」用的类型推断，比 inferType 多覆盖项目与其他。
 * 用于预填类型，用户随时可改——所以宁可粗一点，也不该因为判断不出就拒绝添加。
 */
export function inferEntityType(text: string): DictEntry['type'] {
  const s = text.trim().replace(/\s+/g, '');
  if (!s) return '其他';
  if (PROJECT_HINT.test(s)) return '项目';
  if (
    /^[\u4e00-\u9fa5]{2,4}$/.test(s) &&
    !ORG_HINT.test(s) &&
    !/[《》]/.test(s)
  ) {
    return '人名';
  }
  if (ORG_HINT.test(s)) return '机构';
  return '其他';
}

/**
 * 解析词表文本：一行一个名称，# 开头为注释。
 * 支持 `人名:张三`、`机构:云启科技` 显式指定类型；不写则按名称特征推断
 * （2–4 个汉字且不含机构特征词 → 人名）。
 */
export function parseDict(text: string): DictEntry[] {
  const out: DictEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 2 || line.startsWith('#')) continue;

    const m = /^(机构|人名|项目|其他)\s*[:：]\s*(.+)$/.exec(line);
    if (m) {
      const name = m[2].trim();
      if (name.length >= 2) out.push({ name, type: m[1] as DictEntry['type'] });
    } else {
      out.push({ name: line, type: inferType(line) });
    }
  }
  return out;
}
