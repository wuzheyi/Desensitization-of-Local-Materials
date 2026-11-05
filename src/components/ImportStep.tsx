import { useMemo, useState } from 'react';
import type { EntityType } from '../types';
import { DICT_TYPES, useSession } from '../store';
import { readFileAsText } from '../io/files';
import { sourceLabel } from '../core/lexicon';

type Props = { onNext: () => void };

const SAMPLE = `受让方：深圳市前海云启科技有限公司（以下简称"云启科技"）
统一社会信用代码：91440300MA5FL3XK2P
注册地址：深圳市南山区科技南路18号A座1203室
法定代表人：陈立平    联系电话：0755-86331200 / 13823776655
联系邮箱：chen.liping@yunqitech.com    官网：https://www.yunqitech.com

一、交易概况
云启科技系目标公司控股股东，本次拟转让其持有的 12,000,000 股股份，占标的公司总股本的 32.5%，
交易对价为人民币 1.85 亿元。标的公司注册资本 5,000 万元，2024 年度营业收入 24,683.71 万元，
同比增长 18.6%，综合毛利率 41.2%。前五大客户销售占比合计 68.3%，客户集中度较高。

二、主要风险
截至 2024 年 12 月 31 日，标的公司应收账款余额 8,742.16 万元，较上年增长 43.8%，
增速显著高于收入增速，需关注回款质量。另有对外担保 3,000 万元，被担保方为关联方
杭州启元投资管理有限公司。本次交易由中金资本管理有限公司担任财务顾问，
天健会计师事务所（特殊普通合伙）出具审计报告。`;

export function ImportStep({ onNext }: Props) {
  const rawText = useSession((s) => s.rawText);
  const sourceName = useSession((s) => s.sourceName);
  const items = useSession((s) => s.dictItems);
  const maskDates = useSession((s) => s.maskDates);
  const setRawText = useSession((s) => s.setRawText);
  const setMaskDates = useSession((s) => s.setMaskDates);
  const loadLexicon = useSession((s) => s.loadLexicon);
  const toggleDict = useSession((s) => s.toggleDict);
  const setAllDict = useSession((s) => s.setAllDict);
  const addDict = useSession((s) => s.addDict);
  const removeDict = useSession((s) => s.removeDict);
  const cycleDictType = useSession((s) => s.cycleDictType);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<EntityType>('机构');
  const [addError, setAddError] = useState<string | null>(null);

  const enabledCount = useMemo(() => items.filter((i) => i.enabled).length, [items]);
  const extracted = useMemo(
    () => items.filter((i) => i.origin === 'lex').length,
    [items],
  );

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const text = await readFileAsText(file);
      if (!text.trim()) throw new Error('文件里没有可读文本');
      setRawText(text, file.name);
      // 导入即抽取，候选默认全部勾选——不需要用户再点一次「加入」
      loadLexicon();
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件读取失败');
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = () => {
    if (!newName.trim()) return;
    const r = addDict(newName, newType);
    if (!r.ok) {
      setAddError(r.message ?? '添加失败');
      return;
    }
    setAddError(null);
    setNewName('');
  };

  const start = () => {
    if (!rawText.trim()) {
      setError('请先导入或粘贴材料');
      return;
    }
    setError(null);

    // 粘贴后没触发过抽取（比如直接按了按钮）：就地补一次
    if (items.length === 0) loadLexicon();
    const state = useSession.getState();
    const selected = state.dictItems.filter((i) => i.enabled).length;

    if (selected === 0 && !notice) {
      setNotice(
        '清单里没有勾选任何主体。公司名、人名不会被替换，只有金额、证件号这类规则项会脱敏。确认继续请再点一次「开始识别与脱敏」。',
      );
      return;
    }
    setNotice(null);
    useSession.getState().analyze();
    onNext();
  };

  return (
    <section className="step">
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
      >
        <div className="dz-main">{busy ? '正在解析…' : '把尽调材料拖到这里'}</div>
        <div className="dz-sub">支持 .docx / .txt / .md，文件不会离开这台设备</div>
        <label className="btn ghost sm">
          选择文件
          <input
            type="file"
            accept=".docx,.txt,.md"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="field">
        <div className="field-head">
          <span>或直接粘贴文本</span>
          <span className="muted">
            {sourceName ? `来源：${sourceName}　` : ''}
            {rawText.length} 字
            {rawText.length === 0 && (
              <button
                className="link"
                onClick={() => {
                  setRawText(SAMPLE, '示例材料');
                  loadLexicon();
                }}
              >
                载入示例
              </button>
            )}
          </span>
        </div>
        <textarea
          className="input raw-input"
          value={rawText}
          spellCheck={false}
          placeholder="在此粘贴尽调材料正文，或载入示例看看效果"
          onChange={(e) => setRawText(e.target.value)}
          onBlur={() => {
            // 粘贴/输入后补一次抽取，列表为空时才做，避免打断人工勾选
            if (extracted === 0 && rawText.trim()) loadLexicon();
          }}
        />
      </div>

      <div className="field">
        <div className="field-head">
          <span>主体清单</span>
          <span className="muted">
            已选 <b>{enabledCount}</b> / {items.length} 条 · 简称会自动扩展
          </span>
        </div>

        <div className="lex-panel">
          <div className="lex-tools">
            <button
              className="link"
              onClick={() => loadLexicon()}
              disabled={!rawText.trim() || busy}
              title="用机构后缀、以下简称句式、职务上下文等规则，从正文里重新找出主体；你手动添加的条目会保留"
            >
              重新抽取
            </button>
            <span className="lex-tools-sep" />
            <button className="link" onClick={() => setAllDict(true)} disabled={items.length === 0}>
              全选
            </button>
            <button className="link" onClick={() => setAllDict(false)} disabled={items.length === 0}>
              全不选
            </button>
            <span className="lex-tools-hint">
              取消勾选 = 不脱敏该主体 · 点类型可改
            </span>
          </div>

          <div className="lex-list">
            {items.length === 0 && (
              <div className="lex-empty">
                {rawText.trim()
                  ? '正文里没抽到主体，可在下方手动添加公司名、人名或项目名。'
                  : '导入或粘贴材料后，这里会自动列出识别到的主体。'}
              </div>
            )}

            {items.map((item) => (
              <div
                key={item.name}
                className={`lex-row${item.enabled ? '' : ' off'}${
                  item.origin === 'manual' ? ' manual' : ''
                }`}
                title={item.sample ?? item.name}
              >
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={() => toggleDict(item.name)}
                  aria-label={`${item.enabled ? '取消' : '勾选'}${item.name}`}
                />
                <span className="lex-name" onClick={() => toggleDict(item.name)}>
                  {item.name}
                </span>
                <button
                  type="button"
                  className="lex-type"
                  data-type={item.type}
                  onClick={() => cycleDictType(item.name)}
                  title="点击切换类型：机构 → 人名 → 项目 → 其他"
                >
                  {item.type}
                </button>
                <span className="lex-src">
                  {item.origin === 'manual' ? '手动' : sourceLabel(item.source!)}
                </span>
                <span className="lex-count">{item.count ? `×${item.count}` : '—'}</span>
                <button
                  type="button"
                  className="lex-del"
                  onClick={() => removeDict(item.name)}
                  title="从清单中删除"
                  aria-label={`删除${item.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="lex-add">
            <input
              className="lex-add-input"
              value={newName}
              spellCheck={false}
              placeholder="手动添加：输入公司名、人名或项目名"
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitAdd();
                }
              }}
            />
            <select
              className="lex-add-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value as EntityType)}
              title="选择实体类型"
            >
              {DICT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button className="btn ghost sm" onClick={submitAdd} disabled={!newName.trim()}>
              添加
            </button>
          </div>
          {addError && <div className="lex-error">{addError}</div>}
        </div>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={maskDates}
          onChange={(e) => setMaskDates(e.target.checked)}
        />
        同时脱敏日期（默认关闭：抹掉时间会明显降低材料可读性）
      </label>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      <div className="actions-bar">
        <span className="muted">所有处理都在浏览器内完成，页面不会发出任何网络请求</span>
        <button className="primary" onClick={start}>
          开始识别与脱敏
        </button>
      </div>
    </section>
  );
}
