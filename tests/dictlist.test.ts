import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '../src/store';

const TEXT = `受让方：深圳市前海云启科技有限公司（以下简称"云启科技"）
法定代表人：陈立平
本次交易对价为人民币 1.85 亿元。`;

const reset = () =>
  useSession.setState({
    rawText: '',
    sourceName: '',
    dictItems: [],
    maskDates: false,
    candidates: [],
    excluded: [],
    analyzed: false,
    recent: [],
  });

const names = () => useSession.getState().dictItems.map((i) => i.name);

beforeEach(reset);

describe('主体清单', () => {
  it('抽取出的候选默认全部勾选', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();

    const items = useSession.getState().dictItems;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.enabled)).toBe(true);
    expect(names()).toContain('深圳市前海云启科技有限公司');
    expect(names()).toContain('云启科技');
    expect(names()).toContain('陈立平');
  });

  it('取消勾选后该主体不参与识别', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();
    useSession.getState().analyze();

    const before = useSession.getState().candidates.some((c) => c.display === '陈立平');
    expect(before).toBe(true);

    useSession.getState().toggleDict('陈立平');
    useSession.getState().analyze();

    const after = useSession.getState().candidates.some((c) => c.display === '陈立平');
    expect(after).toBe(false);
  });

  it('全选与全不选', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();

    useSession.getState().setAllDict(false);
    expect(useSession.getState().dictItems.every((i) => !i.enabled)).toBe(true);

    useSession.getState().setAllDict(true);
    expect(useSession.getState().dictItems.every((i) => i.enabled)).toBe(true);
  });

  it('手动添加可指定类型，重复或过短被拒', () => {
    const add = useSession.getState().addDict;
    expect(add('张三', '人名').ok).toBe(true);
    expect(add('启元一号项目', '项目').ok).toBe(true);

    const items = useSession.getState().dictItems;
    expect(items[0]).toMatchObject({
      name: '张三',
      type: '人名',
      enabled: true,
      origin: 'manual',
    });
    expect(items[1].type).toBe('项目');

    expect(add('张三', '人名').ok).toBe(false);
    expect(add('张', '人名').ok).toBe(false);
    expect(useSession.getState().dictItems).toHaveLength(2);
  });

  it('可以从清单删除', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();
    useSession.getState().removeDict('陈立平');
    expect(names()).not.toContain('陈立平');
  });

  it('类型可逐条切换', () => {
    useSession.getState().addDict('启元一号', '机构');
    useSession.getState().cycleDictType('启元一号');
    expect(useSession.getState().dictItems[0].type).toBe('人名');
    useSession.getState().cycleDictType('启元一号');
    expect(useSession.getState().dictItems[0].type).toBe('项目');
  });

  it('重新抽取保留用户已改的类型与勾选状态', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();

    useSession.getState().cycleDictType('陈立平'); // 抽取结果是「人名」，切一次变「项目」
    useSession.getState().toggleDict('云启科技');

    useSession.getState().loadLexicon();

    const items = useSession.getState().dictItems;
    expect(items.find((i) => i.name === '陈立平')?.type).toBe('项目'); // 不被抽取结果覆盖
    // 改类型不等于改成手动条目，来源仍应保持「抽取」
    expect(items.find((i) => i.name === '陈立平')?.origin).toBe('lex');
    expect(items.find((i) => i.name === '云启科技')?.enabled).toBe(false);
  });

  it('直接开始识别时自动抽取，不需要先点加入', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().analyze();

    expect(useSession.getState().dictItems.length).toBeGreaterThan(0);
    expect(useSession.getState().candidates.some((c) => c.display === '云启科技')).toBe(true);
  });

  it('换正文时清掉抽取条目，保留手动条目', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();
    useSession.getState().addDict('张三', '人名');

    useSession.getState().setRawText('另一份材料，内容完全不同。');

    expect(names()).toEqual(['张三']);
  });
});
