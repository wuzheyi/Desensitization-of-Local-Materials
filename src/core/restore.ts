import type { Entity, EntityType, Ledger } from '../types';

/**
 * 反向还原。
 *
 * 关键前提：AI 润色后一定会改动占位符的形态 ——
 *   〔机构_1〕 → 【机构1】 / (机构 1) / [机构_1] / 机构1
 * 所以不能用严格字符串替换，要用「括号种类宽松 + 分隔符可选 + 序号归一」的匹配，
 * 并且把「账本里该出现却没出现」和「出现了但账本里没有」两种情况都报出来，
 * 绝不静默输出一份可能还留着占位符的稿子。
 */

const KNOWN_TYPES = new Set<string>([
  '机构', '人名', '项目', '证件', '电话', '邮箱', '账号', '地址', '信用代码',
  '股票代码', '域名', '网址', '车牌', 'IP', '金额', '比例', '数量', '日期', '其他',
]);

// 括号种类宽松：〔〕[]【】（）()｛｝「」｢｣
const BRACKET_RE = /[〔[【（(｛{「｢]([^〔[【（(｛{〕\]】）)｝}」｣]{1,120})[〕\]】）)｝}」｣]/g;

// 单个占位符本体：类型 + 可选分隔符（_ - · . ：空格）+ 序号
const TOKEN_PART_RE = /^([\u4e00-\u9fa5]{1,8})\s*[_\-\u2010-\u2015·.：:]?\s*(\d{1,4})$/;

// 兜底：AI 把括号整个丢掉，只留「机构_1」
const LOOSE_RE = /(?<![\u4e00-\u9fa5A-Za-z0-9_])[\u4e00-\u9fa5]{1,8}[_\-]\d{1,4}(?![\d])/g;
const LOOSE_PART_RE = /^([\u4e00-\u9fa5]{1,8})[_\-](\d{1,4})$/;

export interface RestoreReport {
  replaced: number;
  missing: Array<{ token: string; display: string; type: EntityType }>;
  unknown: string[];
}

export interface RestoreResult {
  text: string;
  report: RestoreReport;
}

function keyOf(type: string, num: string): string {
  return `${type}_${Number(num)}`;
}

export function restoreText(
  polished: string,
  ledger: Ledger,
  opts: { loose?: boolean } = {},
): RestoreResult {
  const map = new Map<string, Entity>();
  for (const e of ledger.entities) {
    map.set(e.token.slice(1, -1), e); // "〔机构_1〕" → "机构_1"
  }

  const hits = new Map<string, number>();
  const unknown: string[] = [];

  const commit = (e: Entity) => {
    hits.set(e.id, (hits.get(e.id) ?? 0) + 1);
  };

  let text = polished.replace(BRACKET_RE, (whole, content: string) => {
    // 只在「多占位符并列」的分隔符处切分；不能按空白切，
    // 否则 AI 写成「机构 1」时会被拆成「机构」和「1」两段而失效
    const parts = String(content)
      .split(/[、，,\/和与]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) return whole;

    // 两阶段：先全量校验，全部通过才提交，避免部分失败时污染命中统计
    const found: Entity[] = [];
    for (const p of parts) {
      const m = TOKEN_PART_RE.exec(p);
      if (!m || !KNOWN_TYPES.has(m[1])) {
        // 括号里不是占位符（如「证监发〔2020〕12号」「（见第 3 条）」），原样保留
        return whole;
      }
      const e = map.get(keyOf(m[1], m[2]));
      if (!e) {
        unknown.push(`〔${p}〕`);
        return whole;
      }
      found.push(e);
    }

    for (const e of found) commit(e);
    return found.map((e) => e.display).join('、');
  });

  if (opts.loose) {
    text = text.replace(LOOSE_RE, (whole) => {
      const m = LOOSE_PART_RE.exec(whole);
      if (!m || !KNOWN_TYPES.has(m[1])) return whole;
      const e = map.get(keyOf(m[1], m[2]));
      if (!e) {
        unknown.push(whole);
        return whole;
      }
      commit(e);
      return e.display;
    });
  }

  const missing = ledger.entities
    .filter((e) => !hits.has(e.id))
    .map((e) => ({ token: e.token, display: e.display, type: e.type }));

  return {
    text,
    report: {
      replaced: Array.from(hits.values()).reduce((a, b) => a + b, 0),
      missing,
      unknown: Array.from(new Set(unknown)),
    },
  };
}
