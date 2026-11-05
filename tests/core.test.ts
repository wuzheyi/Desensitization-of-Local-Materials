import { describe, it, expect } from 'vitest';
import { detectNumbers } from '../src/core/numeric';
import { detectIdentifiers } from '../src/core/rules';
import { isValidIdCard, isValidUSCC, isLuhnValid } from '../src/core/checksum';
import { resolveOverlaps } from '../src/core/overlap';
import { parseDict } from '../src/core/dict';

const spans = (text: string) => detectIdentifiers(text).map((c) => c.display);

describe('校验位', () => {
  it('身份证校验码', () => {
    expect(isValidIdCard('11010519491231002X')).toBe(true);
    expect(isValidIdCard('110105194912310021')).toBe(false);
  });

  it('统一社会信用代码', () => {
    expect(isValidUSCC('91350100M000100Y43')).toBe(true);
    expect(isValidUSCC('91350100M000100Y44')).toBe(false);
  });

  it('银行卡 Luhn', () => {
    expect(isLuhnValid('4111111111111111')).toBe(true);
    expect(isLuhnValid('4111111111111112')).toBe(false);
  });
});

describe('词表', () => {
  it('按名称特征推断类型', () => {
    expect(parseDict('陈立平')[0]).toEqual({ name: '陈立平', type: '人名' });
    expect(parseDict('杭州启元投资管理有限公司')[0].type).toBe('机构');
    expect(parseDict('云启科技')[0].type).toBe('机构');
  });

  it('支持显式声明类型', () => {
    expect(parseDict('人名:张三')).toEqual([{ name: '张三', type: '人名' }]);
    expect(parseDict('机构:前海云启')).toEqual([{ name: '前海云启', type: '机构' }]);
  });

  it('忽略注释与空行', () => {
    expect(parseDict('# 说明\n\n陈立平')).toHaveLength(1);
  });
});

describe('数值识别', () => {
  const picked = (text: string) =>
    detectNumbers(text).map((c) => `${c.type}:${c.display}`);

  it('金额、比例、数量按形态分级识别', () => {
    expect(picked('注册资本 5,000 万元')).toContain('金额:5,000 万元');
    expect(picked('同比增长 18.6%')).toContain('比例:18.6%');
    expect(picked('员工 1,200 人')).toContain('数量:1,200 人');
  });

  it('小数量、年份、条款号不误伤', () => {
    expect(picked('下设 3 家子公司')).toEqual([]);
    expect(picked('2024 年度报告')).toEqual([]);
    expect(picked('详见第 3.2.1 条')).toEqual([]);
    expect(picked('合同编号 HT2024001')).toEqual([]);
  });

  it('统一单位后同值同单位归一到同一 canonical', () => {
    const cands = detectNumbers('1,200万元');
    expect(cands[0].canonical).toContain('12000000.00|元');
  });

  it('不同写法不共享 canonical（保证还原逐字一致）', () => {
    const a = detectNumbers('1,200万元')[0];
    const b = detectNumbers('1200万元')[0];
    expect(a.canonical).not.toBe(b.canonical);
  });

  it('中文大写与括号负数', () => {
    expect(picked('合计壹仟贰佰万元整')).toContain('金额:壹仟贰佰万元整');
    expect(picked('净利润 (1,234)')).toContain('金额:(1,234)');
  });
});

describe('标识符识别', () => {
  it('证件与代码', () => {
    expect(spans('身份证 11010519491231002X')).toContain('11010519491231002X');
    expect(spans('统一社会信用代码 91350100M000100Y43')).toContain('91350100M000100Y43');
  });

  it('能反查到主体的网络标识', () => {
    expect(spans('官网 https://www.yunqitech.com/about')).toContain('https://www.yunqitech.com/about');
    expect(spans('域名为 yunqitech.com.cn')).toContain('yunqitech.com.cn');
    expect(spans('联系 chen.liping@yunqitech.com')).toContain('chen.liping@yunqitech.com');
    expect(spans('手机 13823776655')).toContain('13823776655');
    expect(spans('座机 0755-86331200')).toContain('0755-86331200');
  });

  it('股票代码', () => {
    expect(spans('贵州茅台 600519.SH')).toContain('600519.SH');
    expect(spans('腾讯控股 00700.HK')).toContain('00700.HK');
    expect(spans('股票代码：300750')).toContain('300750');
  });

  it('邮箱里的域名不会重复命中', () => {
    const text = 'a@yunqitech.com';
    const resolved = resolveOverlaps(detectIdentifiers(text));
    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('邮箱');
  });

  it('地址', () => {
    expect(spans('注册地址：深圳市南山区科技南路18号A座1203室')).toContain(
      '深圳市南山区科技南路18号A座1203室',
    );
  });
});
