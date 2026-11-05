import { create } from 'zustand';
import type { Candidate, EntityType } from './types';
import { detect } from './core/detect';
import { parseDict } from './core/dict';

/** 一段字符区间，用于把「刚才动了哪里」传回界面高亮。 */
export interface Span {
  start: number;
  end: number;
}

/** 最近一次手动操作影响到的位置。added = 新标记为敏感，removed = 撤销了脱敏。 */
export interface RecentSpan extends Span {
  kind: 'added' | 'removed';
}

export interface ManualResult {
  /** 全文命中并脱敏的处数，含用户选中的那一处。 */
  count: number;
  spans: Span[];
}

export interface SessionState {
  rawText: string;
  sourceName: string;
  dictText: string;
  maskDates: boolean;
  candidates: Candidate[];
  excluded: string[];
  analyzed: boolean;
  recent: RecentSpan[];

  setRawText: (text: string, name?: string) => void;
  setDictText: (text: string) => void;
  setMaskDates: (v: boolean) => void;
  analyze: () => void;
  addManual: (start: number, end: number, type: EntityType) => ManualResult;
  exclude: (canonical: string) => Span[];
  include: (canonical: string) => void;
  clearRecent: () => void;
  reset: () => void;
}

/** 全文找出某串的每一处出现（按字符精确匹配，不区分重叠）。 */
export function findAllOccurrences(text: string, needle: string): Span[] {
  const out: Span[] = [];
  if (!needle) return out;
  let idx = text.indexOf(needle);
  while (idx !== -1) {
    out.push({ start: idx, end: idx + needle.length });
    idx = text.indexOf(needle, idx + needle.length);
  }
  return out;
}

export const useSession = create<SessionState>((set, get) => ({
  rawText: '',
  sourceName: '',
  dictText: '',
  maskDates: false,
  candidates: [],
  excluded: [],
  analyzed: false,
  recent: [],

  setRawText: (text, name) =>
    set({
      rawText: text,
      sourceName: name ?? get().sourceName,
      analyzed: false,
      candidates: [],
      recent: [],
    }),

  setDictText: (text) => set({ dictText: text }),

  setMaskDates: (v) => set({ maskDates: v }),

  analyze: () => {
    const { rawText, dictText, maskDates } = get();
    if (!rawText) return;
    const result = detect(rawText, {
      dict: parseDict(dictText),
      maskDates,
      minQuantity: 100,
    });
    set({ candidates: result.candidates, analyzed: true, recent: [] });
  },

  /**
   * 手动标记：用户选中一段就是要「这段信息在全文都不该出现」，
   * 所以按选中的文字做全文精确匹配，所有完全一致的位置一起脱敏。
   * 只标当前这一处的话，同一家公司在后文再出现时仍然会漏。——这正是尽调材料最常见的漏脱。
   */
  addManual: (start, end, type) => {
    const { rawText, candidates } = get();
    const picked = rawText.slice(start, end).trim();
    if (!picked) return { count: 0, spans: [] };

    const spans = findAllOccurrences(rawText, picked);
    if (spans.length === 0) return { count: 0, spans: [] };

    const canonical = `${type}|${picked}`;
    const already = new Set(
      candidates.filter((c) => c.canonical === canonical).map((c) => c.start),
    );

    const fresh: Candidate[] = spans
      .filter((s) => !already.has(s.start))
      .map((s) => ({
        start: s.start,
        end: s.end,
        type,
        canonical,
        display: picked,
        origin: 'manual',
        priority: 999,
      }));

    set({
      candidates: fresh.length > 0 ? [...candidates, ...fresh] : candidates,
      // 重新标记等同于撤销那次撤销——否则用户标记完再撤销、又想标回来会没反应
      excluded: get().excluded.filter((c) => c !== canonical),
      recent: spans.map((s) => ({ ...s, kind: 'added' as const })),
    });

    return { count: spans.length, spans };
  },

  /** 撤销脱敏：同一 canonical 的所有出现一起撤销，并返回它们的位置用于高亮。 */
  exclude: (canonical) => {
    const { candidates, excluded } = get();
    const spans: Span[] = candidates
      .filter((c) => c.canonical === canonical)
      .map((c) => ({ start: c.start, end: c.end }));

    set({
      excluded: Array.from(new Set([...excluded, canonical])),
      recent: spans.map((s) => ({ ...s, kind: 'removed' as const })),
    });

    return spans;
  },

  include: (canonical) =>
    set({
      excluded: get().excluded.filter((c) => c !== canonical),
      recent: [],
    }),

  clearRecent: () => set({ recent: [] }),

  reset: () =>
    set({
      rawText: '',
      sourceName: '',
      candidates: [],
      excluded: [],
      analyzed: false,
      recent: [],
    }),
}));
