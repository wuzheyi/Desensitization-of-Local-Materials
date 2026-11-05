import { useMemo, useState } from 'react';
import { useSession } from '../store';
import { readFileAsText } from '../io/files';
import { extractLexicon, sourceLabel, mergeIntoDict, type LexCandidate } from '../core/lexicon';
import { parseDict } from '../core/dict';

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
  const dictText = useSession((s) => s.dictText);
  const maskDates = useSession((s) => s.maskDates);
  const setRawText = useSession((s) => s.setRawText);
  const setDictText = useSession((s) => s.setDictText);
  const setMaskDates = useSession((s) => s.setMaskDates);
  const analyze = useSession((s) => s.analyze);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [lex, setLex] = useState<LexCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const dictNames = useMemo(
    () => new Set(parseDict(dictText).map((d) => d.name)),
    [dictText],
  );

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const text = await readFileAsText(file);
      if (!text.trim()) throw new Error('文件里没有可读文本');
      setRawText(text, file.name);
      setLex(null);
      setPicked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件读取失败');
    } finally {
      setBusy(false);
    }
  };

  const runExtract = () => {
    const found = extractLexicon(rawText);
    setLex(found);
    // 默认只勾高置信：中置信（项目名之类）误报更多，让用户主动选
    setPicked(new Set(found.filter((c) => c.confidence === 'high' && !dictNames.has(c.name)).map((c) => c.name)));
    setOpen(true);
  };

  const toggle = (name: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const applyPicked = () => {
    const items = (lex ?? []).filter((c) => picked.has(c.name));
    setDictText(mergeIntoDict(dictText, items));
    setLex(null);
    setPicked(new Set());
    setOpen(false);
  };

  const start = () => {
    if (!rawText.trim()) {
      setError('请先导入或粘贴材料');
      return;
    }
    // 词表还是空的，且没抽过候选：正文里的公司名一定漏脱。
    // 拦一次让用户确认，再点就放行（也允许用户就是不想脱敏主体名）。
    if (!lex && dictNames.size === 0 && !notice) {
      const found = extractLexicon(rawText);
      if (found.length > 0) {
        setLex(found);
        setPicked(
          new Set(found.filter((c) => c.confidence === 'high').map((c) => c.name)),
        );
        setOpen(true);
        setNotice(
          `词表还是空的，正文里有 ${found.length} 个候选主体。勾选后点「加入词表」再开始识别；如果确实只想脱敏金额和证件号，再点一次「开始识别」直接继续。`,
        );
        return;
      }
    }
    setError(null);
    setNotice(null);
    analyze();
    onNext();
  };

  const pending = (lex ?? []).filter((c) => !dictNames.has(c.name)).length;

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
                  const found = extractLexicon(SAMPLE);
                  setLex(found);
                  setPicked(
                    new Set(
                      found.filter((c) => c.confidence === 'high').map((c) => c.name),
                    ),
                  );
                  setOpen(true);
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
          onChange={(e) => {
            setRawText(e.target.value);
            setLex(null);
            setPicked(new Set());
          }}
        />
      </div>

      <div className="field">
        <div className="field-head">
          <span>自定义词表</span>
          <span className="muted">
            已收录 {dictNames.size} 条 · 简称会自动扩展
          </span>
        </div>

        <div className="lex-bar">
          <button
            className="btn ghost sm"
            onClick={runExtract}
            disabled={!rawText.trim() || busy}
            title="用机构后缀、以下简称句式、职务上下文等规则，从正文里找出可能是主体的名称"
          >
            从正文抽取候选实体
          </button>
          {lex && (
            <>
              <span className="muted">
                找到 {lex.length} 个，待处理 {pending} 个
              </span>
              <button className="link" onClick={() => setOpen((v) => !v)}>
                {open ? '收起' : '展开'}
              </button>
            </>
          )}
          {!lex && rawText.trim() && (
            <span className="muted">
              不抽也行，但目标公司、关联方、主要自然人都在词表里才脱得干净
            </span>
          )}
        </div>

        {lex && open && (
          <div className="lex-panel">
            <div className="lex-tools">
              <button
                className="link"
                onClick={() =>
                  setPicked(
                    new Set(lex.filter((c) => !dictNames.has(c.name)).map((c) => c.name)),
                  )
                }
              >
                全选
              </button>
              <button
                className="link"
                onClick={() =>
                  setPicked(
                    new Set(
                      lex
                        .filter((c) => c.confidence === 'high' && !dictNames.has(c.name))
                        .map((c) => c.name),
                    ),
                  )
                }
              >
                只选高置信
              </button>
              <button className="link" onClick={() => setPicked(new Set())}>
                清空
              </button>
              <span className="lex-tools-hint">悬停可看原文上下文</span>
            </div>

            <div className="lex-list">
              {lex.map((c) => {
                const inDict = dictNames.has(c.name);
                return (
                  <label
                    key={c.name}
                    className={`lex-row${inDict ? ' in-dict' : ''}`}
                    title={c.sample}
                  >
                    <input
                      type="checkbox"
                      checked={inDict || picked.has(c.name)}
                      disabled={inDict}
                      onChange={() => toggle(c.name)}
                    />
                    <span className="lex-main">
                      <span className="lex-name">{c.name}</span>
                      <span className="lex-type" data-type={c.type}>
                        {c.type}
                      </span>
                    </span>
                    <span className="lex-src">{sourceLabel(c.source)}</span>
                    <span className="lex-count">×{c.count}</span>
                  </label>
                );
              })}
            </div>

            <div className="lex-foot">
              <span className="muted">
                勾选的会合并进下方词表，可再手动增删
              </span>
              <button className="primary sm" onClick={applyPicked} disabled={picked.size === 0}>
                加入词表（{picked.size}）
              </button>
            </div>
          </div>
        )}

        <textarea
          className="input dict-input"
          value={dictText}
          spellCheck={false}
          placeholder={'深圳市前海云启科技有限公司\n杭州启元投资管理有限公司\n陈立平\n也可用「人名:张三」显式指定类型'}
          onChange={(e) => setDictText(e.target.value)}
        />
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
        <button className="primary" onClick={start}>开始识别与脱敏</button>
      </div>
    </section>
  );
}
