import type { Candidate, DetectOptions, EntityType } from '../types';
import { detectIdentifiers } from './rules';
import { detectNumbers, detectDates } from './numeric';
import { findDictMatches } from './dict';
import { expandAliases, extractShortNames } from './alias';
import { resolveOverlaps } from './overlap';

export interface DetectResult {
  candidates: Candidate[];
  /** 词表命中数，用于给用户反馈「词表是否生效」。 */
  dictHits: number;
  aliasHits: number;
}

export function detect(text: string, opts: DetectOptions): DetectResult {
  const candidates: Candidate[] = [];

  // 1) 数值与标识符（两者会互相重叠，交给 resolveOverlaps 裁决）
  candidates.push(...detectNumbers(text, opts.minQuantity ?? 100));
  candidates.push(...detectIdentifiers(text));
  if (opts.maskDates) candidates.push(...detectDates(text));

  // 2) 自定义词表
  const typeOf = new Map<string, EntityType>();
  for (const d of opts.dict) typeOf.set(d.name, d.type);

  const dictMatches = findDictMatches(
    text,
    opts.dict.map((d) => d.name),
  );
  for (const m of dictMatches) {
    const type = typeOf.get(m.pattern) ?? '机构';
    candidates.push({
      start: m.start,
      end: m.end,
      type,
      canonical: `${type}|${m.pattern}`,
      display: m.pattern,
      origin: 'dict',
      priority: 75,
    });
  }

  // 3) 别名扩展：简称单独成实体（各自一个占位符），
  //    这样还原时能逐字回填「全称」「简称」各自的原文，不会把简称替换成全称。
  const aliasMap = new Map<string, EntityType>();
  for (const m of dictMatches) {
    const type = typeOf.get(m.pattern) ?? '机构';
    for (const a of expandAliases(m.pattern)) {
      if (!aliasMap.has(a)) aliasMap.set(a, type);
    }
  }
  const shorts = extractShortNames(
    text,
    dictMatches.map((m) => ({ start: m.start, end: m.end, name: m.pattern })),
  );
  for (const s of shorts) aliasMap.set(s.short, typeOf.get(s.parent) ?? '机构');

  let aliasHits = 0;
  for (const [alias, type] of aliasMap) {
    let idx = text.indexOf(alias);
    while (idx !== -1) {
      candidates.push({
        start: idx,
        end: idx + alias.length,
        type,
        canonical: `${type}|${alias}`,
        display: alias,
        origin: 'alias',
        priority: 55,
      });
      aliasHits++;
      idx = text.indexOf(alias, idx + 1);
    }
  }

  return {
    candidates: resolveOverlaps(candidates),
    dictHits: dictMatches.length,
    aliasHits,
  };
}
