import { beforeEach, describe, expect, it } from 'vitest';
import { findAllOccurrences, useSession } from '../src/store';
import { detect } from '../src/core/detect';
import { parseDict } from '../src/core/dict';

const TEXT =
  '受让方为云启科技，云启科技持有 32.5% 股权。后文再次提到云启科技，以及它的子公司。';

describe('全文查找', () => {
  it('找出每一处完全一致的字符', () => {
    const hits = findAllOccurrences(TEXT, '云启科技');
    expect(hits).toHaveLength(3);
    expect(hits[0]).toEqual({ start: 4, end: 8 });
  });

  it('找不到时返回空数组', () => {
    expect(findAllOccurrences(TEXT, '不存在的名字')).toEqual([]);
  });
});

describe('手动标记：全文同步', () => {
  beforeEach(() => {
    useSession.getState().reset();
  });

  it('选中一处，全文相同内容一起脱敏', () => {
    useSession.getState().setRawText(TEXT);
    const at = TEXT.indexOf('云启科技');

    const res = useSession.getState().addManual(at, at + 4, '机构');

    expect(res.count).toBe(3);
    const cands = useSession
      .getState()
      .candidates.filter((c) => c.canonical === '机构|云启科技');
    expect(cands).toHaveLength(3);
    // 三处都必须是同一个 canonical，还原时才能共用同一个占位符
    expect(new Set(cands.map((c) => c.canonical)).size).toBe(1);
  });

  it('重复标记同一内容不会产生重复候选', () => {
    useSession.getState().setRawText(TEXT);
    const at = TEXT.indexOf('云启科技');

    useSession.getState().addManual(at, at + 4, '机构');
    useSession.getState().addManual(at, at + 4, '机构');

    const cands = useSession
      .getState()
      .candidates.filter((c) => c.canonical === '机构|云启科技');
    expect(cands).toHaveLength(3);
  });

  it('选区带前后空白时按 trim 后的文字匹配', () => {
    useSession.getState().setRawText('联系人  陈立平  ，电话略。');
    const at = '联系人'.length;

    const res = useSession.getState().addManual(at, at + 6, '人名');

    expect(res.count).toBe(1);
    const c = useSession.getState().candidates[0];
    expect(c.display).toBe('陈立平');
    expect(TEXT.slice(0, 0)).toBe('');
  });

  it('标记后返回的位置就是全文所有出现位置', () => {
    useSession.getState().setRawText(TEXT);
    const at = TEXT.indexOf('云启科技');
    const res = useSession.getState().addManual(at, at + 4, '机构');

    expect(res.spans).toHaveLength(3);
    expect(res.spans[0]).toEqual({ start: 4, end: 8 });
    expect(res.spans.every((s) => TEXT.slice(s.start, s.end) === '云启科技')).toBe(true);
    expect(useSession.getState().recent.every((r) => r.kind === 'added')).toBe(true);
  });
});

describe('撤销脱敏：全文同步', () => {
  beforeEach(() => {
    useSession.getState().reset();
  });

  it('撤销后返回受影响位置，且这些位置不再进账本', () => {
    useSession.getState().setRawText(TEXT);
    const result = detect(TEXT, { dict: parseDict('云启科技'), maskDates: false, minQuantity: 100 });
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);

    const canonical = '机构|云启科技';
    useSession.setState({ candidates: result.candidates });

    const spans = useSession.getState().exclude(canonical);

    expect(spans).toHaveLength(3);
    expect(useSession.getState().recent.every((r) => r.kind === 'removed')).toBe(true);
    expect(useSession.getState().excluded).toContain(canonical);
  });

  it('撤销可以恢复', () => {
    useSession.getState().setRawText(TEXT);
    useSession.setState({
      candidates: detect(TEXT, {
        dict: parseDict('云启科技'),
        maskDates: false,
        minQuantity: 100,
      }).candidates,
    });

    useSession.getState().exclude('机构|云启科技');
    useSession.getState().include('机构|云启科技');

    expect(useSession.getState().excluded).toHaveLength(0);
  });

  it('撤销后重新标记，同样的内容要能脱敏回来', () => {
    useSession.getState().setRawText(TEXT);
    const at = TEXT.indexOf('云启科技');

    useSession.getState().addManual(at, at + 4, '机构');
    useSession.getState().exclude('机构|云启科技');
    expect(useSession.getState().excluded).toContain('机构|云启科技');

    // 用户改主意，重新选中同一段再标记一次
    useSession.getState().addManual(at, at + 4, '机构');

    expect(useSession.getState().excluded).not.toContain('机构|云启科技');
    expect(
      useSession.getState().candidates.filter((c) => c.canonical === '机构|云启科技'),
    ).toHaveLength(3);
  });
});
