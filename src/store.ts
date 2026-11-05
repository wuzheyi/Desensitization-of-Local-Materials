import { create } from 'zustand';
import type { Candidate, EntityType } from './types';
import { detect } from './core/detect';
import { parseDict } from './core/dict';

export interface SessionState {
  rawText: string;
  sourceName: string;
  dictText: string;
  maskDates: boolean;
  candidates: Candidate[];
  excluded: string[];
  analyzed: boolean;

  setRawText: (text: string, name?: string) => void;
  setDictText: (text: string) => void;
  setMaskDates: (v: boolean) => void;
  analyze: () => void;
  addManual: (start: number, end: number, type: EntityType) => void;
  exclude: (canonical: string) => void;
  include: (canonical: string) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  rawText: '',
  sourceName: '',
  dictText: '',
  maskDates: false,
  candidates: [],
  excluded: [],
  analyzed: false,

  setRawText: (text, name) =>
    set({ rawText: text, sourceName: name ?? get().sourceName, analyzed: false, candidates: [] }),

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
    set({ candidates: result.candidates, analyzed: true });
  },

  addManual: (start, end, type) => {
    const { rawText, candidates } = get();
    const raw = rawText.slice(start, end);
    if (!raw.trim()) return;
    const candidate: Candidate = {
      start,
      end,
      type,
      canonical: `${type}|${raw}`,
      display: raw,
      origin: 'manual',
      priority: 999,
    };
    set({ candidates: [...candidates, candidate] });
  },

  exclude: (canonical) => set({ excluded: [...new Set([...get().excluded, canonical])] }),

  include: (canonical) => set({ excluded: get().excluded.filter((c) => c !== canonical) }),

  reset: () =>
    set({
      rawText: '',
      sourceName: '',
      candidates: [],
      excluded: [],
      analyzed: false,
    }),
}));
