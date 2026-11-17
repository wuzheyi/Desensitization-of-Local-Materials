import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '../src/store';
import { buildPrompt, PROMPT_TEMPLATE } from '../src/core/prompt';

const TEXT = `受让方：深圳市前海云启科技有限公司（以下简称"云启科技"）
法定代表人：陈立平
本次交易对价为人民币 1.85 亿元。`;

const reset = () =>
  useSession.setState({
    rawText: '',
    sourceName: '',
    dictItems: [],
    lexLoadedFor: '',
    maskDates: false,
    candidates: [],
    excluded: [],
    analyzed: false,
    recent: [],
  });

beforeEach(reset);

describe('自动抽取每份正文只做一次', () => {
  it('loadLexicon 标记当前正文已抽过', () => {
    useSession.getState().setRawText(TEXT);
    expect(useSession.getState().lexLoadedFor).toBe('');
    useSession.getState().loadLexicon();
    expect(useSession.getState().lexLoadedFor).toBe(TEXT);
  });

  it('删改后 analyze 不再把抽取结果加回来', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();
    expect(useSession.getState().dictItems.length).toBeGreaterThan(0);

    // 用户主动清空清单（模拟「把识别错的都删掉」）
    useSession.setState({ dictItems: [] });
    useSession.getState().analyze();

    expect(useSession.getState().dictItems).toHaveLength(0);
  });

  it('重命名成手动条目后 analyze 不重复加回原名', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();
    useSession.getState().updateDict('陈立平', { name: '张三条' });
    useSession.setState({ dictItems: useSession.getState().dictItems.filter((i) => i.origin === 'manual') });

    useSession.getState().analyze();
    const names = useSession.getState().dictItems.map((i) => i.name);
    expect(names).toContain('张三条');
    expect(names).not.toContain('陈立平');
  });

  it('显式 loadLexicon 仍然会重新抽取', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();
    useSession.setState({ dictItems: [] });
    useSession.getState().loadLexicon();
    expect(useSession.getState().dictItems.length).toBeGreaterThan(0);
  });

  it('换正文后 lexLoadedFor 清空，可重新自动抽取', () => {
    useSession.getState().setRawText(TEXT);
    useSession.getState().loadLexicon();
    useSession.getState().setRawText('另一份材料。');
    expect(useSession.getState().lexLoadedFor).toBe('');
    useSession.getState().analyze();
    expect(useSession.getState().lexLoadedFor).toBe('另一份材料。');
  });
});

describe('提示词与脱敏稿拼接', () => {
  it('缺省用内置模板', () => {
    expect(buildPrompt('正文')).toBe(`${PROMPT_TEMPLATE.trimEnd()}\n\n正文`);
  });

  it('用用户改过的提示词', () => {
    const custom = '润色时保留占位符。';
    expect(buildPrompt('〔金额_1〕', custom)).toBe(`${custom}\n\n〔金额_1〕`);
  });

  it('提示词清空时只返回正文', () => {
    expect(buildPrompt('正文', '   ')).toBe('正文');
  });
});
