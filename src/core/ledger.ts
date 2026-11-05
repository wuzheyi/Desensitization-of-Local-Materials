import type { Candidate, Entity, EntityType, Ledger } from '../types';
import { resolveOverlaps } from './overlap';

/**
 * 实体账本：把候选命中归并成实体，并分配占位符。
 *
 * 占位符格式 〔类型_序号〕：
 *  - 全角方括号：中文大模型几乎不会改写这种形态
 *  - 带类型与序号：AI 能理解「这是同一个主体」，润色不跑偏
 *  - 同一 canonical 共用同一占位符，所以全文指代一致
 */
export function buildLedger(text: string, cands: Candidate[]): Ledger {
  const resolved = resolveOverlaps(cands);

  const groups = new Map<string, Candidate[]>();
  for (const c of resolved) {
    const arr = groups.get(c.canonical);
    if (arr) arr.push(c);
    else groups.set(c.canonical, [c]);
  }

  const ordered = Array.from(groups.values()).sort((a, b) => a[0].start - b[0].start);
  const counters = new Map<EntityType, number>();
  const entities: Entity[] = [];

  for (const group of ordered) {
    const type = group[0].type;
    const n = (counters.get(type) ?? 0) + 1;
    counters.set(type, n);

    entities.push({
      id: `e${entities.length + 1}`,
      type,
      canonical: group[0].canonical,
      display: group[0].display,
      token: `〔${type}_${n}〕`,
      occurrences: group.map((c) => ({
        start: c.start,
        end: c.end,
        raw: text.slice(c.start, c.end),
      })),
      origin: group[0].origin,
    });
  }

  return { entities };
}

export interface HitSegment {
  kind: 'plain' | 'hit';
  text: string;
  entityId?: string;
  /** 该片段在原文中的绝对起止偏移，用于把鼠标选区换算回文本位置。 */
  s: number;
  e: number;
}

export interface AlignedRow {
  left: HitSegment[];
  right: HitSegment[];
}

/**
 * 按行对齐切分。
 *
 * 双栏各自自由换行会导致左右行错位，逐行对比时很容易看错。
 * 所以按原文的换行切成行，每行一对单元格，由 CSS 网格保证左右同高。
 * 空行保留，维持原文段落节奏。
 */
export function splitAligned(text: string, ledger: Ledger): AlignedRow[] {
  const spans: Array<{ start: number; end: number; entity: Entity }> = [];
  for (const e of ledger.entities) {
    for (const o of e.occurrences) spans.push({ start: o.start, end: o.end, entity: e });
  }
  spans.sort((a, b) => a.start - b.start);

  const lineRanges: Array<{ start: number; end: number }> = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      lineRanges.push({ start: lineStart, end: i });
      lineStart = i + 1;
    }
  }

  return lineRanges.map(({ start, end }) => {
    const left: HitSegment[] = [];
    const right: HitSegment[] = [];
    const inside = spans.filter((s) => s.end > start && s.start < end);

    let cursor = start;
    for (const sp of inside) {
      if (sp.start > cursor) {
        left.push({ kind: 'plain', text: text.slice(cursor, sp.start), s: cursor, e: sp.start });
        right.push({ kind: 'plain', text: text.slice(cursor, sp.start), s: cursor, e: sp.start });
      }
      const from = Math.max(sp.start, start);
      const to = Math.min(sp.end, end);
      left.push({ kind: 'hit', text: text.slice(from, to), entityId: sp.entity.id, s: from, e: to });
      right.push({ kind: 'hit', text: sp.entity.token, entityId: sp.entity.id, s: from, e: to });
      cursor = to;
    }
    if (cursor < end) {
      left.push({ kind: 'plain', text: text.slice(cursor, end), s: cursor, e: end });
      right.push({ kind: 'plain', text: text.slice(cursor, end), s: cursor, e: end });
    }
    return { left, right };
  });
}

export function maskedText(text: string, ledger: Ledger): string {
  const spans: Array<{ start: number; end: number; token: string }> = [];
  for (const e of ledger.entities) {
    for (const o of e.occurrences) spans.push({ start: o.start, end: o.end, token: e.token });
  }
  spans.sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const s of spans) {
    out += text.slice(cursor, s.start) + s.token;
    cursor = s.end;
  }
  return out + text.slice(cursor);
}

export interface TypeStat {
  type: EntityType;
  entities: number;
  occurrences: number;
}

export function statsByType(ledger: Ledger): TypeStat[] {
  const map = new Map<EntityType, TypeStat>();
  for (const e of ledger.entities) {
    const cur = map.get(e.type) ?? { type: e.type, entities: 0, occurrences: 0 };
    cur.entities += 1;
    cur.occurrences += e.occurrences.length;
    map.set(e.type, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.occurrences - a.occurrences);
}
