import type { Candidate } from '../types';
import { isValidIdCard, isLuhnValid } from './checksum';

/**
 * 标识符识别：凡是能把材料反查到具体主体的东西，都算敏感。
 * 除了证件号、手机号，还包括股票代码、域名、官网、注册地址、车牌、IP ——
 * 这些单独看不像隐私，但配一个工商查询就能定位到公司。
 */

interface Rule {
  re: RegExp;
  type: Candidate['type'];
  priority: number;
  /** 校验函数，返回 false 则丢弃（用于压误报）。 */
  validate?: (raw: string) => boolean;
  /** 归一化，默认原样。 */
  canonical?: (raw: string) => string;
}

const AREAS =
  '北京|上海|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门|深圳|广州|杭州|南京|苏州|成都|武汉|西安|青岛|宁波|厦门|大连|合肥|长沙|郑州|济南|福州|无锡|东莞|佛山|珠海|昆明|南昌|沈阳|哈尔滨|长春|石家庄|太原|南宁|贵阳|兰州|海口';

const ADDRESS_RE = new RegExp(
  `(?:中国)?(?:${AREAS})(?:省|市|自治区|特别行政区|地区)?` +
    `(?:[\\u4e00-\\u9fa5]{2,8}(?:市|区|县|旗)){0,2}` +
    `[\\u4e00-\\u9fa5A-Za-z0-9]{2,20}(?:路|街|大道|巷|弄|胡同|道)` +
    `[\\u4e00-\\u9fa5A-Za-z0-9]{0,12}号` +
    `(?:[\\u4e00-\\u9fa5A-Za-z0-9]{0,20}(?:楼|层|室|栋|座|单元|号楼))?`,
  'g',
);

const RULES: Rule[] = [
  // —— 证件与代码：靠校验位压误报 ——
  {
    re: /(?<![\dA-Za-z])(\d{17}[\dXx]|\d{15})(?![\dA-Za-z])/g,
    type: '证件',
    priority: 101,
    validate: isValidIdCard,
  },
  {
    // 按结构判定而非校验位：真实材料里代码常有个别录入错误，
    // 一旦按校验位严格过滤就会整条漏脱，宁可多打一次标记也不能漏。
    // 结构：登记管理部门[159Y] + 机构类别[1-9] + 6位行政区划 + 10位本体
    re: /(?<![0-9A-HJ-NPQRTUWXY])([159Y][1-9]\d{6}[0-9A-HJ-NPQRTUWXY]{10})(?![0-9A-HJ-NPQRTUWXY])/g,
    type: '信用代码',
    priority: 100,
  },
  {
    re: /(?<!\d)(\d{16,19})(?!\d)/g,
    type: '账号',
    priority: 95,
    validate: isLuhnValid,
  },

  // —— 联系方式 ——
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, type: '邮箱', priority: 96 },
  { re: /(?<!\d)(1[3-9]\d{9})(?!\d)/g, type: '电话', priority: 95 },
  {
    re: /(?<!\d)(0\d{2,3}[-\s]?\d{7,8}(?:[-转]\d{1,6})?)(?!\d)/g,
    type: '电话',
    priority: 90,
  },

  // —— 能定位到主体的网络标识 ——
  { re: /https?:\/\/[^\s<>"'，。；、）】]+/g, type: '网址', priority: 94 },
  {
    re: /(?<![@\w.-])((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com\.cn|net\.cn|org\.cn|gov\.cn|edu\.cn|com\.hk|com|cn|net|org|edu|gov|io|co|top|xyz|info|biz|cc|vip|club|shop|site|online|tech|hk|us|jp|uk|de))(?![a-zA-Z0-9-])/g,
    type: '域名',
    priority: 88,
  },
  {
    re: /(?<![\d.])((?:\d{1,3}\.){3}\d{1,3})(?![\d.])/g,
    type: 'IP',
    priority: 90,
    validate: (raw) => raw.split('.').every((p) => Number(p) <= 255),
  },

  // —— 股票代码：带交易所后缀、或出现在「代码」上下文中 ——
  {
    re: /(?<!\d)(\d{6}\.(?:SH|SZ|BJ|HK|sh|sz|bj|hk))(?![A-Za-z0-9])/g,
    type: '股票代码',
    priority: 98,
  },
  {
    re: /(?<!\d)(\d{5}\.HK)(?![A-Za-z0-9])/g,
    type: '股票代码',
    priority: 98,
  },
  {
    re: /(?:股票代码|证券代码|证券简称|A股代码|H股代码|交易代码)\s*[：:]?\s*([0-9]{5,6}(?:\.[A-Za-z]{2})?)/g,
    type: '股票代码',
    priority: 97,
  },

  // —— 其他可反查标识 ——
  {
    re: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]/g,
    type: '车牌',
    priority: 93,
  },
  { re: ADDRESS_RE, type: '地址', priority: 85 },
];

export function detectIdentifiers(text: string): Candidate[] {
  const out: Candidate[] = [];

  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    for (const m of text.matchAll(re)) {
      const raw = m[1] ?? m[0];
      if (!raw) continue;
      if (rule.validate && !rule.validate(raw)) continue;

      // 上下文型规则只捕获数字部分，用「匹配串末尾对齐」反推真实起点
      const start = m.index! + m[0].length - raw.length;
      const canonical = rule.canonical ? rule.canonical(raw) : raw;

      out.push({
        start,
        end: start + raw.length,
        type: rule.type,
        canonical: `${rule.type}|${canonical}`,
        display: raw,
        origin: 'rule',
        priority: rule.priority,
      });
    }
  }

  return out;
}
