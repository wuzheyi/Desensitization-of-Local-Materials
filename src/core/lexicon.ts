/**
 * 词表自动抽取。
 *
 * 让用户面对一个空白的词表框自己填公司名，是这类工具最容易失败的环节：
 * 他并不知道材料里有哪些主体，也不确定该怎么写全称。手工维护的必然结果是漏。
 *
 * 这里用无模型的方式做高召回抽取：
 *   1. 机构名 —— 以机构后缀为锚点向左回溯，遇虚词或角色词截断；
 *   2. 简称   —— 复用「以下简称」句式，绑定到父全称；
 *   3. 人名   —— 职务、称谓、持股动作等上下文锚点 + 姓氏校验；
 *   4. 项目名 —— 「XX项目」与书名号内的非文件类名称。
 *
 * 产出是**候选**，必须由用户确认才进词表。因为这些启发式都有误报空间，
 * 而误脱敏（把普通词替换成占位符）对体验的破坏比漏脱更直接。
 */

import type { EntityType } from '../types';
import { extractShortNames } from './alias';
import { inferType } from './dict';

export type LexSource = 'org' | 'short' | 'person' | 'project';

export interface LexCandidate {
  name: string;
  type: EntityType;
  source: LexSource;
  /** 在文中的出现次数，用于帮用户判断重要性。 */
  count: number;
  confidence: 'high' | 'medium';
  /** 首次出现的上下文，便于确认这个名字是不是真的主体。 */
  sample: string;
}

/* ------------------------------------------------------------------ */
/* 机构名                                                              */
/* ------------------------------------------------------------------ */

/**
 * 机构后缀。刻意剔除了「科技」「实业」「贸易」「工程」「投资」这类过泛的词：
 * 它们单独作后缀时几乎必然误命中（「本次交易涉及工程」→「交易涉及工程」），
 * 而包含它们的正式名称一定带「有限公司」「集团」等更明确的后缀。
 */
const ORG_SUFFIXES = [
  '股份有限公司',
  '有限责任公司',
  '集团有限公司',
  '股份公司',
  '集团公司',
  '有限合伙企业',
  '普通合伙企业',
  '有限公司',
  '分公司',
  '子公司',
  '合伙企业',
  '律师事务所',
  '会计师事务所',
  '税务师事务所',
  '资产评估事务所',
  '事务所',
  '研究院',
  '研究所',
  '设计院',
  '规划院',
  '学院',
  '大学',
  '学校',
  '医院',
  '出版社',
  '报社',
  '电视台',
  '基金会',
  '委员会',
  '联合会',
  '促进会',
  '协会',
  '商会',
  '集团',
  '银行',
  '证券',
  '基金',
  '保险',
  '信托',
  '中心',
  '工厂',
  '商行',
  '酒店',
  '宾馆',
  '厂',
].sort((a, b) => b.length - a.length);

/** 回溯途中遇到这些词就截断，并把该词本身排除在名字之外。 */
const BREAK_WORDS = [
  '实际控制人',
  '高级管理人员',
  '法定代表人',
  '控股股东',
  '交易对方',
  '被投资方',
  '被申请人',
  '被担保方',
  '目标公司',
  '标的公司',
  '上市公司',
  '项目公司',
  '全资子公司',
  '控股子公司',
  '参股公司',
  '关联方',
  '担保方',
  '受让方',
  '转让方',
  '投资方',
  '申请人',
  '债权人',
  '债务人',
  '委托人',
  '受托人',
  '管理人',
  '发起人',
  '认购人',
  '出让方',
  '借款方',
  '出借方',
  '负责人',
  '发行人',
  '对手方',
  '合作方',
  '自然人',
  '本公司',
  '该公司',
  '贵公司',
  '上述公司',
  '各方',
  '双方',
  '甲方',
  '乙方',
  '丙方',
  '丁方',
  '股东',
  '董事',
  '监事',
  '高管',
  '对方',
  '其中包括',
  '包括',
  '例如',
  '其中',
  '根据',
  '依据',
  '按照',
  '截至',
  '截止',
  '由于',
].sort((a, b) => b.length - a.length);

/**
 * 单字截断符。只收最安全的虚词——像「本」「投」「控」「持」「方」这类
 * 在名字内部大量出现的字一律不能进，否则「中金资本」会被切成「管理」。
 */
const BREAK_CHARS = new Set(
  '的了与和及或为是由在对将已被拟其该经从等号系属于者以就但而则至给使把让并且因故如若按据亦均也还'.split(''),
);

/**
 * 后缀后面紧跟这些字，说明它只是更长名称的一部分，不是名字结尾：
 * 「控股**股**东」「投资管理里的资**管**理」「集团**有**限公司」「银行**股**份」。
 * 这是消掉大部分误命中的关键——不加这条，「控股股东」会抽出一个叫「目标公司控股」的假实体。
 */
const TAIL_BLOCK = /[股有管限公责任合伙伴事务所在内区办制]/;

/** 名字开头不该出现的虚词与指示词。 */
const HEAD_BAD = /^(?:[的了与和及或为是由在对将已被拟其该本我贵经从等号系属于者以就但而则至给使把让并且因故如若按据亦均也还另此各你他]|另有|对外|上述|本次|其中|包括|涉及|以及|并且|同时|此外|目前|根据|按照|依据|由于|因此|但是|如果|所谓|任何|所有|全体|部分|其余|相关|相应|有关|下属|旗下|所属|双方|各方)/;

const NAME_CHAR = /[\u4e00-\u9fa5A-Za-z0-9·（）()]/;

/** 泛称，不是具体主体，脱敏没有意义。 */
const GENERIC = new Set([
  '本公司',
  '该公司',
  '贵公司',
  '上述公司',
  '标的公司',
  '目标公司',
  '上市公司',
  '项目公司',
  '公司',
  '集团',
  '企业',
  '单位',
  '主体',
  '银行',
  '基金',
  '证券',
  '中心',
  '协会',
  '委员会',
  '事务所',
  '有限公司',
  '股份有限公司',
  '有限责任公司',
  '集团有限公司',
]);

/** 剥掉名字前面的角色词（「关联方杭州启元……」→「杭州启元……」）。 */
const ROLE_PREFIX = [
  ...BREAK_WORDS,
  '被担保的',
  '债务人',
  '担保人',
].sort((a, b) => b.length - a.length);

interface OrgHit {
  start: number;
  name: string;
}

function stripRolePrefix(raw: string): string {
  let s = raw;
  for (let guard = 0; guard < 4; guard++) {
    const hit = ROLE_PREFIX.find((p) => s.startsWith(p) && s.length > p.length + 3);
    if (!hit) break;
    s = s.slice(hit.length);
  }
  return s;
}

function bracketsBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '（' || ch === '(') depth++;
    else if (ch === '）' || ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** 从后缀起点向左回溯出完整名称。 */
function backtrack(text: string, suffixStart: number): string {
  const LIMIT = 24;
  let i = suffixStart;
  let steps = 0;

  while (i > 0 && steps < LIMIT) {
    // 先看多字截断词：它比单字判断更靠左，必须先命中
    const win = text.slice(Math.max(0, i - 8), i);
    const bw = BREAK_WORDS.find((w) => win.endsWith(w));
    if (bw) {
      i -= bw.length;
      break;
    }
    const ch = text[i - 1];
    if (!NAME_CHAR.test(ch)) break;
    if (BREAK_CHARS.has(ch)) break;
    i--;
    steps++;
  }

  return stripRolePrefix(text.slice(i, suffixStart));
}

export function findOrgNames(text: string): OrgHit[] {  const hits: Array<{ start: number; end: number; name: string }> = [];

  for (const suffix of ORG_SUFFIXES) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(suffix, from);
      if (at === -1) break;
      from = at + suffix.length;

      const next = text[at + suffix.length];
      // 后缀处在更长的名称中间，跳过
      if (next !== undefined && TAIL_BLOCK.test(next)) continue;

      const head = backtrack(text, at);
      if (head.length < 2 || HEAD_BAD.test(head)) continue;

      let name = head + suffix;
      let end = at + suffix.length;

      // 「天健会计师事务所（特殊普通合伙）」：后缀后的括号属于全称的一部分。
      // 但「（以下简称"云启科技"）」不是，必须排除，否则全称里会混进简称。
      if (next === '（' || next === '(') {
        const close = next === '（' ? '）' : ')';
        const closeAt = text.indexOf(close, end + 1);
        const inner = closeAt === -1 ? '' : text.slice(end + 1, closeAt);
        if (
          inner.length > 0 &&
          inner.length <= 24 &&
          !/\s/.test(inner) &&
          !/^(以下简称|下称|简称|原名|曾用名)/.test(inner.replace(/^["“]/, ''))
        ) {
          name += text.slice(end, closeAt + 1);
          end = closeAt + 1;
        }
      }

      if (name.length < 4 || name.length > 40) continue;
      if (GENERIC.has(name) || !bracketsBalanced(name)) continue;
      hits.push({ start: at - head.length, end, name });
    }
  }

  // 同一终点被多个后缀命中时（「有限公司」/「股份有限公司」），保留起点最早的那个
  const byEnd = new Map<number, OrgHit>();
  for (const h of hits) {
    const prev = byEnd.get(h.end);
    if (!prev || h.start < prev.start) byEnd.set(h.end, { start: h.start, name: h.name });
  }

  const out: OrgHit[] = [];
  const seen = new Set<string>();
  for (const h of byEnd.values()) {
    if (seen.has(h.name)) continue;
    seen.add(h.name);
    out.push(h);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 人名                                                                */
/* ------------------------------------------------------------------ */

/** 常见姓氏。用来挡住「陈立平」这种名字之外的误抽（如「签订协议」）。 */
const SURNAMES = new Set(
  (
    '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤常温康施文牛樊葛邢安齐易乔伍庞颜倪庄聂章鲁岳翟殷詹申欧耿关兰焦俞左柳甘祝包宁尚符舒阮柯纪梅童凌毕单季裴霍涂成苗谷盛曲翁冉骆蓝路游辛靳管柴蒙鲍华喻祁蒲房滕屈饶解牟艾尤阳时穆农司卓古吉缪简车项连芦麦褚娄窦戚岑景党宫费卜冷晏席卫米柏宗瞿桂全佟应臧闵苟邬边卞姬师和仇栾隋商刁沙荣巫寇桑郎甄丛仲虞敖巩明佘池查麻苑迟邝'
  ).split(''),
);

const NAME_STOP = new Set([
  '公司',
  '集团',
  '有限',
  '协议',
  '合同',
  '材料',
  '报告',
  '项目',
  '本次',
  '交易',
  '上述',
  '以下',
  '其中',
  '工商',
  '银行',
  '账户',
  '信息',
  '情况',
  '根据',
  '相关',
  '主要',
  '负责',
]);

function isPersonName(s: string): boolean {
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(s)) return false;
  if (NAME_STOP.has(s)) return false;
  if (!SURNAMES.has(s[0])) return false;
  return true;
}

/** 名字后面必须跟边界，否则「陈立平先生」之外的连写会截错。 */
const TAIL = '(?=[\\s，。、；：:（）()《》"“”]|先生|女士|$)';

const PERSON_PATTERNS: RegExp[] = [
  new RegExp(
    `(?:法定代表人|负责人|董事长|副董事长|执行董事|总经理|副总经理|财务负责人|监事|联系人|经办人|授权代表|自然人股东|股东|出资人|投资人|合伙人|实际控制人|受益所有人|签字人)\\s*(?:为|是|系)?\\s*[:：]?\\s*([\\u4e00-\\u9fa5]{2,4})${TAIL}`,
    'g',
  ),
  new RegExp(`([\\u4e00-\\u9fa5]{2,4})(?:先生|女士)`, 'g'),
  new RegExp(`由\\s*([\\u4e00-\\u9fa5]{2,4})\\s*(?:持(?:有|股)|出资|担任|签署|提供)`, 'g'),
  new RegExp(
    `([\\u4e00-\\u9fa5]{2,4})\\s*(?:系|为公司|为公司之)(?:实际控制人|控股股东|法定代表人|股东)`,
    'g',
  ),
];

/** 并列人名：「股东为王振华、李慧敏」——只有第一个人有上下文锚点，后面靠并列扩展。 */
const PARALLEL = /[、，,]?(?:和|与)?([\u4e00-\u9fa5]{2,4})(?=[、，。；：\s）)]|$)/y;

function collectParallel(text: string, start: number): Array<{ name: string; at: number }> {
  const out: Array<{ name: string; at: number }> = [];
  let cursor = start;
  for (let guard = 0; guard < 6; guard++) {
    PARALLEL.lastIndex = cursor;
    const m = PARALLEL.exec(text);
    if (!m) break;
    if (!isPersonName(m[1])) break;
    out.push({ name: m[1], at: cursor + m[0].indexOf(m[1]) });
    cursor += m[0].length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 项目名                                                              */
/* ------------------------------------------------------------------ */

const DOC_WORDS =
  /(协议|合同|章程|办法|规定|通知|决定|细则|意见|指引|准则|制度|报告|报表|说明|承诺|函|法|条例|规则|清单|目录|申请|申报|批复|备案|凭证|发票|明细|台账|框架|方案|计划书|备忘录|条款)/;

const PROJECT_PATTERN = new RegExp(
  `([\\u4e00-\\u9fa5A-Za-z0-9]{2,20})(?:项目|专项计划|信托计划|资管计划)`,
  'g',
);

const PROJECT_STOP = /^(本次|该|本|上述|以下|相关|涉及|标的|目标|在建|拟建|新|老|各|此|其)/;

/** 「项目公司为启元一号项目」——贪婪匹配会把虚词圈进来，取最后一个虚词之后的部分。 */
const VIRTUAL_TAIL = /[的了与和及或为是由在对将已被拟其该本为作]/;

function trimToNamePart(base: string): string {
  let cut = 0;
  for (let i = 0; i < base.length; i++) {
    if (VIRTUAL_TAIL.test(base[i])) cut = i + 1;
  }
  return base.slice(cut);
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function context(text: string, at: number, len: number): string {
  const s = Math.max(0, at - 10);
  const e = Math.min(text.length, at + len + 10);
  return text.slice(s, e).replace(/\s+/g, ' ').trim();
}

const SOURCE_LABEL: Record<LexSource, string> = {
  org: '机构后缀',
  short: '简称',
  person: '姓名线索',
  project: '项目名',
};

export function sourceLabel(s: LexSource): string {
  return SOURCE_LABEL[s];
}

export function extractLexicon(text: string): LexCandidate[] {
  if (!text.trim()) return [];

  const acc = new Map<string, LexCandidate>();

  const push = (
    name: string,
    type: EntityType,
    source: LexSource,
    at: number,
    confidence: 'high' | 'medium',
  ) => {
    const clean = name.trim();
    if (clean.length < 2) return;
    const prev = acc.get(clean);
    if (prev) {
      prev.count++;
      if (confidence === 'high') prev.confidence = 'high';
      return;
    }
    acc.set(clean, {
      name: clean,
      type,
      source,
      count: 1,
      confidence,
      sample: context(text, Math.max(0, at), clean.length),
    });
  };

  // 1) 机构
  const orgs = findOrgNames(text);
  for (const o of orgs) push(o.name, '机构', 'org', o.start, 'high');

  // 2) 简称（「以下简称」句式）
  const shorts = extractShortNames(
    text,
    orgs.map((o) => ({ start: o.start, end: o.start + o.name.length, name: o.name })),
  );
  for (const s of shorts) {
    const at = text.indexOf(s.short);
    if (at !== -1) push(s.short, '机构', 'short', at, 'high');
  }

  // 3) 人名
  for (const re of PERSON_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1];
      if (!isPersonName(name)) continue;
      const at = m.index + m[0].indexOf(name);
      push(name, '人名', 'person', at, 'high');
      for (const p of collectParallel(text, at + name.length)) {
        push(p.name, '人名', 'person', p.at, 'high');
      }
    }
  }

  // 4) 项目名：书名号里的非文件名称
  const bookRe = /《([^》\n]{2,30})》/g;
  let bm: RegExpExecArray | null;
  while ((bm = bookRe.exec(text)) !== null) {
    const inner = bm[1].trim();
    if (DOC_WORDS.test(inner)) continue;
    if (acc.has(inner)) continue;
    push(inner, '项目', 'project', bm.index, 'medium');
  }

  // 5) 项目名：「XX项目」
  PROJECT_PATTERN.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PROJECT_PATTERN.exec(text)) !== null) {
    const base = trimToNamePart(pm[1]);
    if (PROJECT_STOP.test(base) || base.length < 3) continue;
    const suffix = pm[0].slice(pm[1].length);
    const full = base + suffix;
    if (acc.has(full) || DOC_WORDS.test(full)) continue;
    push(full, '项目', 'project', pm.index + pm[1].length - base.length, 'medium');
  }

  const list = Array.from(acc.values());

  // 裁掉是更长候选后缀的碎片（「有限公司」被「深圳市前海云启科技有限公司」覆盖）
  const kept = list.filter((a) => {
    if (a.source !== 'org') return true;
    return !list.some(
      (b) =>
        b !== a &&
        b.confidence === 'high' &&
        b.name.length > a.name.length &&
        b.name.endsWith(a.name),
    );
  });

  const rank = { high: 0, medium: 1 } as const;
  kept.sort(
    (a, b) =>
      rank[a.confidence] - rank[b.confidence] ||
      b.count - a.count ||
      b.name.length - a.name.length,
  );
  return kept;
}

/** 把勾选的候选合并进现有词表文本，按名称去重。 */
export function mergeIntoDict(
  dictText: string,
  picked: Array<{ name: string; type: EntityType }>,
): string {
  const lines = dictText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const existing = new Set(
    lines.map((l) => {
      const m = /^(?:机构|人名|项目|其他)\s*[:：]\s*(.+)$/.exec(l);
      return (m ? m[1] : l).trim();
    }),
  );

  for (const p of picked) {
    if (existing.has(p.name)) continue;
    existing.add(p.name);
    // 类型能被推断出来就不加前缀，保持词表干净
    lines.push(inferType(p.name) === p.type ? p.name : `${p.type}:${p.name}`);
  }

  return lines.join('\n');
}
