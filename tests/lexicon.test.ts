import { describe, it, expect } from 'vitest';
import { extractLexicon } from '../src/core/lexicon';

const TEXT = `受让方：深圳市前海云启科技有限公司（以下简称"云启科技"）
统一社会信用代码：91440300MA5FL3XK2P
注册地址：深圳市南山区科技南路18号A座1203室
法定代表人：陈立平    联系电话：0755-86331200 / 13823776655

一、交易概况
云启科技系目标公司控股股东，本次拟转让其持有的 12,000,000 股股份，占标的公司总股本的 32.5%，
交易对价为人民币 1.85 亿元。标的公司注册资本 5,000 万元，2024 年度营业收入 24,683.71 万元。
另有对外担保 3,000 万元，被担保方为关联方杭州启元投资管理有限公司。
本次交易由中金资本管理有限公司担任财务顾问，天健会计师事务所（特殊普通合伙）出具审计报告。
项目公司为启元一号项目而设立，股东为王振华、李慧敏，实际控制人王振华先生。
依据《股权转让协议》及《启元一号项目投资框架》，双方约定如下。`;

const names = (t: string) => extractLexicon(t).map((c) => c.name);

describe('词表自动抽取', () => {
  it('抓到材料里的全部机构全称', () => {
    const n = names(TEXT);
    expect(n).toContain('深圳市前海云启科技有限公司');
    expect(n).toContain('杭州启元投资管理有限公司');
    expect(n).toContain('中金资本管理有限公司');
    // 后缀后的括号属于全称的一部分
    expect(n).toContain('天健会计师事务所（特殊普通合伙）');
  });

  it('从「以下简称」句式补出简称', () => {
    const c = extractLexicon(TEXT).find((x) => x.name === '云启科技');
    expect(c?.source).toBe('short');
    expect(c?.type).toBe('机构');
  });

  it('抓到人名，包括并列的人名', () => {
    const n = names(TEXT);
    expect(n).toContain('陈立平');
    expect(n).toContain('王振华');
    expect(n).toContain('李慧敏');
  });

  it('不产出名称内部的碎片', () => {
    const n = names(TEXT);
    // 「控股股东」里的「控股」、「投资管理」里的「资管」都会诱使后缀误命中
    expect(n).not.toContain('目标公司控股');
    expect(n).not.toContain('杭州启元投资管');
    expect(n).not.toContain('管理有限公司');
    expect(n).not.toContain('另有对外担保');
    expect(n).not.toContain('标的公司控股');
  });

  it('不把文件名当项目名', () => {
    const n = names(TEXT);
    expect(n).not.toContain('股权转让协议');
    expect(n).not.toContain('启元一号项目投资框架');
    expect(n).toContain('启元一号项目');
  });

  it('统计出现次数', () => {
    const w = extractLexicon(TEXT).find((x) => x.name === '王振华');
    expect(w?.count).toBe(2);
  });

  it('空文本不报错', () => {
    expect(extractLexicon('')).toEqual([]);
  });
});
