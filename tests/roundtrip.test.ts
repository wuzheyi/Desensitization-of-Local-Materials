import { describe, it, expect } from 'vitest';
import { detect } from '../src/core/detect';
import { buildLedger, maskedText } from '../src/core/ledger';
import { restoreText } from '../src/core/restore';

const TEXT = `受让方：深圳市前海云启科技有限公司（以下简称"云启科技"）
统一社会信用代码：91350100M000100Y43
注册地址：深圳市南山区科技南路18号A座1203室
法定代表人：陈立平    联系电话：0755-86331200 / 13823776655
官网：https://www.yunqitech.com    邮箱：chen.liping@yunqitech.com

一、交易概况
云启科技系目标公司控股股东，本次拟转让其持有的 12,000,000 股股份，占标的公司总股本的 32.5%，
交易对价为人民币 1.85 亿元。标的公司注册资本 5,000 万元，2024 年度营业收入 24,683.71 万元，
同比增长 18.6%，综合毛利率 41.2%。股票代码 600519.SH。`;

const DICT = [{ name: '深圳市前海云启科技有限公司', type: '机构' as const }];

function pipeline(text: string) {
  const { candidates } = detect(text, { dict: DICT });
  const ledger = buildLedger(text, candidates);
  return { ledger, masked: maskedText(text, ledger) };
}

/** 模拟 AI 的破坏性改写：换括号、加空格、去掉下划线。 */
function simulateAI(masked: string): string {
  return masked
    .replace(/〔/g, '【')
    .replace(/〕/g, '】')
    .replace(/_/g, ' ')
    .replace(/。\n/g, '。\n\n');
}

describe('脱敏', () => {
  it('生成占位符并保留单位', () => {
    const { masked } = pipeline(TEXT);
    expect(masked).toContain('〔机构_1〕');
    expect(masked).toContain('〔金额_');
    expect(masked).toContain('〔比例_');
    expect(masked).toContain('〔股票代码_');
    expect(masked).not.toContain('深圳市前海云启科技有限公司');
    expect(masked).not.toContain('91350100M000100Y43');
    expect(masked).not.toContain('13823776655');
    expect(masked).not.toContain('yunqitech.com');
  });

  it('金额与比例全部脱敏，年份不误伤', () => {
    const { masked } = pipeline(TEXT);
    expect(masked).not.toContain('1.85 亿元');
    expect(masked).not.toContain('32.5%');
    expect(masked).not.toContain('24,683.71');
    expect(masked).toContain('2024 年度'); // 年份保留，保证可读性
  });

  it('简称被单独识别并分配独立占位符', () => {
    const { ledger, masked } = pipeline(TEXT);
    const short = ledger.entities.find((e) => e.display === '云启科技');
    expect(short).toBeDefined();
    expect(masked).toContain(short!.token);
  });

  it('同一实体全文共用一个占位符', () => {
    const { ledger } = pipeline(TEXT);
    const org = ledger.entities.find((e) => e.display === '深圳市前海云启科技有限公司');
    expect(org!.occurrences).toHaveLength(1);
    const short = ledger.entities.find((e) => e.display === '云启科技');
    expect(short!.occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

describe('还原', () => {
  it('未改动的脱敏稿可逐字还原', () => {
    const { ledger, masked } = pipeline(TEXT);
    const { text, report } = restoreText(masked, ledger);
    expect(text).toBe(TEXT);
    expect(report.missing).toHaveLength(0);
    expect(report.unknown).toHaveLength(0);
  });

  it('AI 换掉括号、空格、下划线后仍能还原', () => {
    const { ledger, masked } = pipeline(TEXT);
    const damaged = simulateAI(masked);
    expect(damaged).not.toBe(masked);
    const { text, report } = restoreText(damaged, ledger);
    expect(report.missing).toHaveLength(0);
    expect(report.unknown).toHaveLength(0);
    // AI 额外插入了空行，折叠后正文内容应完全一致
    const collapse = (s: string) => s.replace(/\n{2,}/g, '\n');
    expect(collapse(text)).toBe(collapse(TEXT));
    expect(text).not.toContain('【机构');
    expect(text).not.toContain('〔');
  });

  it('AI 删掉占位符时如实报缺失，不静默输出', () => {
    const { ledger, masked } = pipeline(TEXT);
    const damaged = masked.replace(/〔机构_1〕/, '该受让方');
    const { text, report } = restoreText(damaged, ledger);
    expect(report.missing.length).toBeGreaterThan(0);
    expect(report.missing[0].display).toBe('深圳市前海云启科技有限公司');
    expect(text).toContain('该受让方');
  });

  it('AI 自造占位符时报告未知项', () => {
    const { ledger, masked } = pipeline(TEXT);
    const damaged = `${masked}\n另：〔机构_99〕为新增主体。`;
    const { report } = restoreText(damaged, ledger);
    expect(report.unknown.length).toBeGreaterThan(0);
  });

  it('文号里的〔2020〕不会被当成占位符', () => {
    const { ledger, masked } = pipeline(TEXT);
    const withDocNo = `${masked}\n依据证监发〔2020〕12号文。`;
    const { text, report } = restoreText(withDocNo, ledger);
    expect(text).toContain('〔2020〕');
    expect(report.unknown).toHaveLength(0);
  });
});
