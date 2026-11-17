import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '../src/store';
import { inferEntityType } from '../src/core/dict';

const TEXT = `受让方：深圳市前海云启科技有限公司
法定代表人：陈立平
启元一号项目由该公司承建。`;

const reset = () =>
  useSession.setState({
    rawText: TEXT,
    sourceName: '',
    dictItems: [],
    maskDates: false,
    candidates: [],
    excluded: [],
    analyzed: false,
    recent: [],
  });

beforeEach(reset);

describe('选区类型推断', () => {
  it('识别项目、人名、机构', () => {
    expect(inferEntityType('启元一号项目')).toBe('项目');
    expect(inferEntityType('陈立平')).toBe('人名');
    expect(inferEntityType('中金资本管理有限公司')).toBe('机构');
  });

  it('判不出时归为其他，不拒绝添加', () => {
    expect(inferEntityType('2024Q3-特别事项')).toBe('其他');
  });
});

describe('从选区加词', () => {
  it('自动判型后加入并返回类型', () => {
    const r = useSession.getState().addFromSelection('启元一号项目');
    expect(r).toMatchObject({ ok: true, name: '启元一号项目', type: '项目' });
    const item = useSession
      .getState()
      .dictItems.find((i) => i.name === '启元一号项目');
    expect(item?.type).toBe('项目');
    expect(item?.count).toBe(1);
  });

  it('太短的文字被拒绝，重复添加被拒绝', () => {
    expect(useSession.getState().addFromSelection('的').ok).toBe(false);
    expect(useSession.getState().addFromSelection('陈立平').ok).toBe(true);
    expect(useSession.getState().addFromSelection('陈立平').ok).toBe(false);
  });

  it('全文出现次数被记入条目', () => {
    useSession.getState().addFromSelection('陈立平');
    // 正文里「陈立平」只出现 1 次
    expect(useSession.getState().dictItems[0].count).toBe(1);
  });
});

describe('修改词表条目', () => {
  it('只改类型', () => {
    useSession.getState().addDict('云启科技', '机构');
    const r = useSession.getState().updateDict('云启科技', { type: '人名' });
    expect(r.ok).toBe(true);
    expect(useSession.getState().dictItems[0].type).toBe('人名');
  });

  it('改名并重算出现次数，来源转为手动', () => {
    useSession.getState().setRawText('甲公司与甲公司签约');
    useSession.getState().addDict('乙方', '机构'); // count 未记
    const r = useSession.getState().updateDict('乙方', { name: '甲公司' });
    expect(r.ok).toBe(true);
    const item = useSession.getState().dictItems[0];
    expect(item.name).toBe('甲公司');
    expect(item.count).toBe(2);
    expect(item.origin).toBe('manual');
  });

  it('改名冲突或过短被拒绝，原条目不变', () => {
    useSession.getState().addDict('甲公司', '机构');
    useSession.getState().addDict('乙公司', '机构');
    expect(
      useSession.getState().updateDict('乙公司', { name: '甲公司' }).ok,
    ).toBe(false);
    expect(
      useSession.getState().updateDict('乙公司', { name: 'X' }).ok,
    ).toBe(false);
    expect(useSession.getState().dictItems[1].name).toBe('乙公司');
  });

  it('改过的条目在重新抽取时不被覆盖', () => {
    useSession.setState({ rawText: TEXT });
    useSession.getState().loadLexicon();
    useSession.getState().updateDict('陈立平', { type: '项目' });
    useSession.getState().loadLexicon();
    expect(
      useSession.getState().dictItems.find((i) => i.name === '陈立平')?.type,
    ).toBe('项目');
  });
});
