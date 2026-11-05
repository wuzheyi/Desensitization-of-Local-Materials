/**
 * 别名扩展。
 *
 * 尽调材料里最常见的漏脱不是「公司全称没识别」，而是同一主体在后文用了简称：
 *   深圳市前海云启科技有限公司（以下简称"云启科技"）…… 云启科技成立于 2017 年。
 * 全称识别了，简称漏了，等于没脱敏。
 *
 * 这里做两件事：
 *   1. 从「以下简称」句式里直接抓简称，绑定到前面的全称；
 *   2. 用去行政区域、去组织形式后缀的方式生成候选别名。
 *
 * 第 2 步很容易过头：把「北京银行」削成「北京」，会让全篇的「北京」都被脱敏。
 * 所以有三重保险：长度门槛、行政区域黑名单、通用词黑名单。
 */

const AREAS =
  '北京|上海|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门|深圳|广州|杭州|南京|苏州|成都|武汉|西安|青岛|宁波|厦门|大连|合肥|长沙|郑州|济南|福州|无锡|东莞|佛山|珠海|昆明|南昌|沈阳|哈尔滨|长春|石家庄|太原|南宁|贵阳|兰州|海口';

const AREA_SET = new Set(AREAS.split('|'));

const AREA_PREFIX = new RegExp(`^(?:中国)?(?:${AREAS})(?:省|市|自治区|特别行政区|地区)?`);

const ORG_TAIL =
  /(?:股份有限公司|有限责任公司|有限公司|集团有限公司|集团公司|集团|控股|股份|公司|厂|研究院|研究所|事务所|中心|银行|证券|基金|保险|信托|租赁|资管|科技|实业|发展|投资|贸易|建设|工程|咨询|管理|服务)+$/;

const STOP_WORDS = new Set([
  '公司', '集团', '有限', '控股', '股份', '科技', '实业', '发展', '投资', '管理',
  '中心', '银行', '证券', '基金', '中国', '国际', '贸易', '建设', '工程', '服务',
]);

/** 生成候选别名（不含原全称）。 */
export function expandAliases(name: string): string[] {
  const out = new Set<string>();
  if (name.length < 4) return [];

  const stripped = name.replace(AREA_PREFIX, '');
  if (stripped && stripped !== name && stripped.length >= 4 && !AREA_SET.has(stripped)) {
    out.add(stripped);
  }

  // 只有足够长的名称才做「取字号」，否则容易削出通用词
  if (name.length >= 6) {
    const core = stripped.replace(ORG_TAIL, '');
    if (
      core.length >= 2 &&
      core !== stripped &&
      !AREA_SET.has(core) &&
      !STOP_WORDS.has(core)
    ) {
      out.add(core);
    }
  }

  return Array.from(out).filter((a) => a !== name);
}

export interface ShortNameHit {
  short: string;
  parent: string;
}

/** 从「XX有限公司（以下简称"YY"）」中抽取简称。 */
export function extractShortNames(
  text: string,
  orgs: Array<{ start: number; end: number; name: string }>,
): ShortNameHit[] {
  const hits: ShortNameHit[] = [];
  for (const o of orgs) {
    if (o.start > 0 && /[\u4e00-\u9fa5A-Za-z0-9]/.test(text[o.start - 1])) {
      // 命中位置前还有同类字符，说明这是更长名称的片段，跳过
      continue;
    }
    const after = text.slice(o.end, o.end + 48);
    const m = /^\s*[（(]\s*(?:以下简称|下称|简称)\s*[“"'「]?([^”"'」)）]{2,20})[”"'」]?\s*[)）]/.exec(after);
    if (m && m[1].trim().length >= 2) {
      hits.push({ short: m[1].trim(), parent: o.name });
    }
  }
  return hits;
}
