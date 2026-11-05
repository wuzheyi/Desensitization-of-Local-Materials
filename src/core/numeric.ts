import type { Candidate } from '../types';

/**
 * 数值识别。
 *
 * 设计目标：宁可少脱，不可误伤。
 * 一个 4 位数字可能是年份、条款号、金额、股票代码、编号，误伤的代价是文本被切碎、
 * 用户要逐条撤销；漏脱的代价是信息泄露。金融尽调场景下泄露代价更高，但误伤率一旦
 * 超过 5% 用户就会放弃工具，所以采用「按形态分级放行」的策略：
 *
 *   带货币单位        → 必脱
 *   带 % / 倍 / bp    → 必脱
 *   带人/家/股 等数量  → 数值 ≥ 100 才脱（"3家子公司"这种小数量保留，否则文本不可读）
 *   无单位            → 仅有千分位或小数点且 ≥ 1000 才脱（"2023"这类裸数字一律放过）
 */

const MONEY_BASE = new Set(['元', '美元', '港元', '港币', '人民币', 'RMB', 'CNY', 'USD', 'HKD']);
const RATIO_UNITS = new Set(['%', '％', '‰', 'bp', 'pp', '倍']);
const QTY_UNITS = new Set([
  '平方米', '㎡', '吨', '台', '家', '户', '笔', '人', '个', '次', '项', '股', '辆', '套', '间', '亩', '公顷', '件', '份',
]);

// 长的写在前面，避免「万元」被「万」抢先匹配
const UNIT_PATTERN = [
  '亿元人民币', '万美元', '亿港元', '亿美元', '万港元', '万港币', '万元人民币',
  '万元', '亿元', '平方米', '㎡',
  '万', '亿',
  '元', '美元', '港元', '港币', '人民币', 'RMB', 'CNY', 'USD', 'HKD',
  '%', '％', '‰', 'bp', 'pp', '倍',
  '吨', '台', '家', '户', '笔', '人', '个', '次', '项', '股', '辆', '套', '间', '亩', '公顷', '件', '份',
].join('|');

// 前置断言排除：数字前面是数字/小数点/逗号/字母时不算独立数值
const NUM_RE = new RegExp(
  `(?<![\\d.,A-Za-z])(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})?`,
  'g',
);

// 财务惯例的括号负数，如 (1,234) —— 要求必须有千分位，避免把条款序号 (1) 当成负数
const PAREN_NEG_RE = /\(\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*\)/g;

// 中文大写金额
const CN_UPPER_RE = /[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]{2,}元(?:整)?/g;
// 中文数字金额（必须带货币单位，否则「五大客户」会被吞）
const CN_NUM_RE = /[一二三四五六七八九十百千万亿两]{1,8}(?:万元|亿元|元)/g;

const DATE_RE = /\d{4}\s*年(?:\s*\d{1,2}\s*月)?(?:\s*\d{1,2}\s*日)?|\d{4}[-/]\d{1,2}[-/]\d{1,2}/g;

interface SplitUnit {
  mult: number;
  base: string;
}

/** 把「万元」「亿美元」拆成倍率 + 基准单位。 */
function splitUnit(unit: string | undefined): SplitUnit {
  if (!unit) return { mult: 1, base: '' };
  let mult = 1;
  let rest = unit;
  if (rest.startsWith('万')) {
    mult = 1e4;
    rest = rest.slice(1);
  } else if (rest.startsWith('亿')) {
    mult = 1e8;
    rest = rest.slice(1);
  }
  return { mult, base: rest === '' ? '元' : rest };
}

/** 格式指纹：把数字位替换为 #，用来区分「1,200万元」与「1200万元」。 */
function formatSignature(raw: string): string {
  return raw.replace(/\d/g, '#');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeCandidate(
  start: number,
  end: number,
  raw: string,
  type: Candidate['type'],
  valueKey: string,
): Candidate {
  return {
    start,
    end,
    type,
    canonical: `${type}|${valueKey}|${formatSignature(raw)}`,
    display: raw,
    origin: 'rule',
    priority: 60,
  };
}

export function detectNumbers(text: string, minQuantity = 100): Candidate[] {
  const out: Candidate[] = [];

  // 1) 括号负数
  for (const m of text.matchAll(PAREN_NEG_RE)) {
    const raw = m[0];
    const numRaw = m[1];
    const value = round2(-parseFloat(numRaw.replace(/,/g, '')));
    out.push(
      makeCandidate(m.index!, m.index! + raw.length, raw, '金额', `${value.toFixed(2)}|元`),
    );
  }

  // 2) 阿拉伯数字 + 可选单位
  for (const m of text.matchAll(NUM_RE)) {
    const raw = m[0];
    const numRaw = m[1];
    const unit = m[2];
    const start = m.index!;
    const end = start + raw.length;

    // 落进括号负数里的，跳过（已由上面处理）
    if (/^\(\s*[\d,.]+\s*\)$/.test(raw)) continue;

    const { mult, base } = splitUnit(unit);
    const plain = parseFloat(numRaw.replace(/,/g, ''));
    if (!Number.isFinite(plain)) continue;
    const value = round2(plain * mult);

    const hasComma = numRaw.includes(',');
    const hasDecimal = numRaw.includes('.');
    const suffix = raw.slice(numRaw.length).trim();

    if (!unit) {
      // 无单位：只有「像金额」的形态才脱
      if ((hasComma || hasDecimal) && value >= 1000) {
        out.push(makeCandidate(start, end, raw, '金额', `${value.toFixed(2)}|元`));
      }
      continue;
    }

    if (RATIO_UNITS.has(unit)) {
      out.push(makeCandidate(start, end, raw, '比例', `${value.toFixed(2)}|${base}`));
      continue;
    }

    if (MONEY_BASE.has(base)) {
      out.push(makeCandidate(start, end, raw, '金额', `${value.toFixed(2)}|${base}`));
      continue;
    }

    if (QTY_UNITS.has(unit) || QTY_UNITS.has(suffix)) {
      if (value >= minQuantity) {
        out.push(makeCandidate(start, end, raw, '数量', `${value.toFixed(2)}|${unit}`));
      }
      continue;
    }

    // 其余情况（如「亿元」已被上面的基单位判定覆盖）按金额兜底
    if (value >= 1000) {
      out.push(makeCandidate(start, end, raw, '金额', `${value.toFixed(2)}|${base || '元'}`));
    }
  }

  // 3) 中文大写金额
  for (const m of text.matchAll(CN_UPPER_RE)) {
    const raw = m[0];
    out.push(makeCandidate(m.index!, m.index! + raw.length, raw, '金额', `cn|${raw}`));
  }

  // 4) 中文数字金额
  for (const m of text.matchAll(CN_NUM_RE)) {
    const raw = m[0];
    out.push(makeCandidate(m.index!, m.index! + raw.length, raw, '金额', `cn|${raw}`));
  }

  return out;
}

/** 日期脱敏为可选项，默认关闭。 */
export function detectDates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const raw = m[0];
    out.push({
      start: m.index!,
      end: m.index! + raw.length,
      type: '日期',
      canonical: `日期|${raw}`,
      display: raw,
      origin: 'rule',
      priority: 65,
    });
  }
  return out;
}
