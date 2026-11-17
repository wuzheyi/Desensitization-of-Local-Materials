import { create } from 'zustand';
import type { Candidate, EntityType } from './types';
import { detect } from './core/detect';
import { extractLexicon, type LexSource } from './core/lexicon';
import { inferEntityType } from './core/dict';

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

/**
 * 主体清单的一条。清单本身就是词表——抽取出的候选默认全部勾选，
 * 所以「发现了主体」和「主体参与脱敏」不再需要两步确认。
 */
export interface DictItem {
  name: string;
  type: EntityType;
  /** 勾选状态。取消勾选 = 从词表移除，但保留在清单里方便再勾回来。 */
  enabled: boolean;
  /** lex = 从正文抽取，manual = 用户手动添加。 */
  origin: 'lex' | 'manual';
  /** 用户手动改过类型。重抽时不覆盖，但来源仍算抽取。 */
  typeEdited?: boolean;
  source?: LexSource;
  count?: number;
  sample?: string;
  confidence?: 'high' | 'medium';
}

/** 可选的实体类型，用于手动添加与逐条改类。 */
export const DICT_TYPES: EntityType[] = ['机构', '人名', '项目', '其他'];

export interface SessionState {
  rawText: string;
  sourceName: string;
  dictItems: DictItem[];
  maskDates: boolean;
  candidates: Candidate[];
  excluded: string[];
  analyzed: boolean;
  recent: RecentSpan[];

  setRawText: (text: string, name?: string) => void;
  setMaskDates: (v: boolean) => void;
  /** 从正文重抽主体，合并进清单；已存在条目保留原勾选与类型。返回抽到的条数。 */
  loadLexicon: () => number;
  toggleDict: (name: string) => void;
  setAllDict: (enabled: boolean) => void;
  addDict: (name: string, type: EntityType) => { ok: boolean; message?: string };
  /** 从正文选区加词：自动判型后加入清单，返回实际采用的类型。 */
  addFromSelection: (text: string) => {
    ok: boolean;
    message?: string;
    name?: string;
    type?: EntityType;
  };
  /** 修改已有条目的名称与类型；返回是否成功及提示。 */
  updateDict: (
    oldName: string,
    next: { name?: string; type?: EntityType },
  ) => { ok: boolean; message?: string };
  removeDict: (name: string) => void;
  cycleDictType: (name: string) => void;
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
  dictItems: [],
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
      // 换了正文，抽取来的条目不再对应任何文字，必须清掉；
      // 手动添加的条目是用户自己的知识，留着，换稿后还能用
      dictItems: get().dictItems.filter((i) => i.origin === 'manual'),
    }),

  setMaskDates: (v) => set({ maskDates: v }),

  loadLexicon: () => {
    const { rawText, dictItems } = get();
    if (!rawText.trim()) {
      set({ dictItems: [] });
      return 0;
    }

    const found = extractLexicon(rawText);
    const prev = new Map(dictItems.map((i) => [i.name, i] as const));

    const merged: DictItem[] = found.map((c) => {
      const old = prev.get(c.name);
      if (old) {
        // 已存在的条目：勾选状态和用户改过的类型优先于抽取结果
        return {
          ...old,
          count: c.count,
          sample: c.sample,
          confidence: c.confidence,
          source: old.origin === 'lex' ? c.source : old.source,
          // 用户改过的类型优先，不被抽取结果冲掉
          type: old.origin === 'manual' || old.typeEdited ? old.type : c.type,
        };
      }
      return {
        name: c.name,
        type: c.type,
        // 抽取到的默认全部勾选
        enabled: true,
        origin: 'lex',
        source: c.source,
        count: c.count,
        sample: c.sample,
        confidence: c.confidence,
      };
    });

    // 手动添加但正文里抽不到的，保留在清单末尾
    for (const it of dictItems) {
      if (it.origin === 'manual' && !merged.some((m) => m.name === it.name)) {
        merged.push(it);
      }
    }

    set({ dictItems: merged });
    return found.length;
  },

  toggleDict: (name) =>
    set({
      dictItems: get().dictItems.map((i) =>
        i.name === name ? { ...i, enabled: !i.enabled } : i,
      ),
    }),

  setAllDict: (enabled) =>
    set({ dictItems: get().dictItems.map((i) => ({ ...i, enabled })) }),

  addDict: (name, type) => {
    const clean = name.trim().replace(/\s+/g, '');
    if (clean.length < 2) return { ok: false, message: '名称至少 2 个字' };
    const items = get().dictItems;
    if (items.some((i) => i.name === clean)) {
      return { ok: false, message: `「${clean}」已在清单中` };
    }
    set({
      dictItems: [
        ...items,
        { name: clean, type, enabled: true, origin: 'manual' },
      ],
    });
    return { ok: true };
  },

  addFromSelection: (text) => {
    const clean = text.trim().replace(/\s+/g, '');
    if (clean.length < 2) {
      return { ok: false, message: '选中的文字太短，至少 2 个字' };
    }
    const type = inferEntityType(clean);
    const r = get().addDict(clean, type);
    if (!r.ok) return r;
    // 记下出现次数，便于和抽取条目一致地展示
    const count = findAllOccurrences(get().rawText, clean).length;
    set({
      dictItems: get().dictItems.map((i) =>
        i.name === clean ? { ...i, count, source: undefined } : i,
      ),
    });
    return { ok: true, name: clean, type };
  },

  updateDict: (oldName, next) => {
    const items = get().dictItems;
    const at = items.findIndex((i) => i.name === oldName);
    if (at === -1) return { ok: false, message: `「${oldName}」不在清单中` };

    const cleanName =
      next.name === undefined
        ? oldName
        : next.name.trim().replace(/\s+/g, '');
    if (cleanName.length < 2) {
      return { ok: false, message: '名称至少 2 个字' };
    }
    if (
      cleanName !== oldName &&
      items.some((i, idx) => idx !== at && i.name === cleanName)
    ) {
      return { ok: false, message: `「${cleanName}」已在清单中` };
    }

    const type = next.type ?? items[at].type;
    const renamed = cleanName !== oldName;
    set({
      dictItems: items.map((i, idx) =>
        idx === at
          ? {
              ...i,
              name: cleanName,
              type,
              // 内容或类型改过，都视为用户定稿，重抽时不被覆盖
              typeEdited: i.typeEdited || renamed || type !== i.type,
              origin: renamed ? 'manual' : i.origin,
              count: renamed
                ? findAllOccurrences(get().rawText, cleanName).length || i.count
                : i.count,
            }
          : i,
      ),
    });
    return { ok: true };
  },

  removeDict: (name) =>
    set({ dictItems: get().dictItems.filter((i) => i.name !== name) }),

  /** 类型判断错了就地纠正，比删了重加快。 */
  cycleDictType: (name) =>
    set({
      dictItems: get().dictItems.map((i) => {
        if (i.name !== name) return i;
        const at = DICT_TYPES.indexOf(i.type);
        const next = DICT_TYPES[(at + 1) % DICT_TYPES.length];
        return { ...i, type: next, typeEdited: true };
      }),
    }),

  analyze: () => {
    const { rawText, maskDates } = get();
    if (!rawText) return;

    // 从未抽取过就点开始识别：先自动抽取，候选默认全部勾选，不让用户卡在这一步
    if (get().dictItems.length === 0) get().loadLexicon();

    const result = detect(rawText, {
      dict: get()
        .dictItems.filter((i) => i.enabled)
        .map((i) => ({ name: i.name, type: i.type })),
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
      dictItems: [],
      candidates: [],
      excluded: [],
      analyzed: false,
      recent: [],
    }),
}));
