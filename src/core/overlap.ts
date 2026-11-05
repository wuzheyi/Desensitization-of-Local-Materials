import type { Candidate } from '../types';

/**
 * 重叠裁剪。
 * 同一段文字可能被多条规则命中（如 600519.SH 同时被「股票代码」和「数字」命中），
 * 只保留起点最靠前、长度最长、优先级最高的那条。
 */
export function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      b.priority - a.priority,
  );

  const out: Candidate[] = [];
  let lastEnd = -1;
  for (const c of sorted) {
    if (c.start >= lastEnd) {
      out.push(c);
      lastEnd = c.end;
    }
  }
  return out;
}
