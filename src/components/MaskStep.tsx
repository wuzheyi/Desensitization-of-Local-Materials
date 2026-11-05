import { useMemo, useState } from 'react';
import type { Ledger } from '../types';
import { splitAligned, statsByType } from '../core/ledger';
import { useSession } from '../store';

const TYPES = [
  '机构', '人名', '证件', '电话', '邮箱', '账号', '地址', '信用代码',
  '股票代码', '域名', '网址', '车牌', 'IP', '金额', '比例', '数量', '日期', '其他',
] as const;

type Props = { ledger: Ledger; onPrev: () => void; onNext: () => void };

/** 把 DOM 里的选区端点换算成原文的绝对字符偏移。 */
function pointOffset(node: Node | null, offset: number): number | null {
  if (!node) return null;
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? (node.parentElement as HTMLElement) : (node as HTMLElement);
  while (el && el.dataset.s === undefined) el = el.parentElement;
  if (!el) return null;

  const base = Number(el.dataset.s);
  if (node.nodeType === Node.TEXT_NODE) {
    let inner = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t: Node | null;
    while ((t = walker.nextNode())) {
      if (t === node) return base + inner + offset;
      inner += (t.nodeValue ?? '').length;
    }
    return base + inner;
  }

  let inner = 0;
  for (let i = 0; i < offset && i < el.childNodes.length; i++) {
    inner += (el.childNodes[i].textContent ?? '').length;
  }
  return base + inner;
}

export function MaskStep({ ledger, onPrev, onNext }: Props) {
  const rawText = useSession((s) => s.rawText);
  const addManual = useSession((s) => s.addManual);
  const exclude = useSession((s) => s.exclude);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [sel, setSel] = useState<{ start: number; end: number; text: string } | null>(null);
  const [selType, setSelType] = useState<string>('机构');

  const rows = useMemo(() => splitAligned(rawText, ledger), [rawText, ledger]);
  const stats = useMemo(() => statsByType(ledger), [ledger]);

  const totalOcc = ledger.entities.reduce((n, e) => n + e.occurrences.length, 0);
  const active = ledger.entities.find((e) => e.id === activeId) ?? null;

  const handleSelect = () => {
    const container = document.getElementById('doc-raw');
    const s = window.getSelection();
    if (!container || !s || s.rangeCount === 0 || s.isCollapsed) {
      setSel(null);
      return;
    }
    const range = s.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSel(null);
      return;
    }
    const a = pointOffset(range.startContainer, range.startOffset);
    const b = pointOffset(range.endContainer, range.endOffset);
    if (a === null || b === null) {
      setSel(null);
      return;
    }
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const text = rawText.slice(start, end);
    if (text.trim().length === 0) {
      setSel(null);
      return;
    }
    setSel({ start, end, text });
  };

  const confirmManual = () => {
    if (!sel) return;
    addManual(sel.start, sel.end, selType as never);
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <section className="step">
      <div className="stats">
        <span className="stat-strong">{ledger.entities.length}</span> 个实体
        <span className="dot">·</span>
        <span className="stat-strong">{totalOcc}</span> 处命中
        <div className="chips">
          {stats.map((s) => (
            <span key={s.type} className="chip">
              {s.type} <b>{s.occurrences}</b>
            </span>
          ))}
          {stats.length === 0 && <span className="muted">未识别到敏感信息，可在右侧手动标记</span>}
        </div>
      </div>

      {sel && (
        <div className="selbar">
          <span className="muted">
            已选「{sel.text.slice(0, 24)}
            {sel.text.length > 24 ? '…' : ''}」
          </span>
          <select value={selType} onChange={(e) => setSelType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="primary sm" onClick={confirmManual}>
            标记为敏感
          </button>
          <button className="ghost sm" onClick={() => setSel(null)}>
            取消
          </button>
        </div>
      )}

      <div className="compare" id="doc-raw" onMouseUp={handleSelect}>
        <div className="compare-head">
          <div>原文（仅存在本机内存）<span className="hint-inline">选中文字可手动脱敏</span></div>
          <div>脱敏稿（可导出给 AI）</div>
        </div>
        <div className="compare-body">
          {rows.map((row, i) => (
            <div className="compare-row" key={i}>
              <div className="cell">
                {row.left.length === 0 ? (
                  <span className="pad"> </span>
                ) : (
                  row.left.map((seg, j) =>
                    seg.kind === 'hit' ? (
                      <mark
                        key={j}
                        className="hit"
                        data-s={seg.s}
                        data-e={seg.e}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveId(seg.entityId!);
                        }}
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={j} data-s={seg.s} data-e={seg.e}>
                        {seg.text}
                      </span>
                    ),
                  )
                )}
              </div>
              <div className="cell cell-right">
                {row.right.length === 0 ? (
                  <span className="pad"> </span>
                ) : (
                  row.right.map((seg, j) =>
                    seg.kind === 'hit' ? (
                      <span
                        key={j}
                        className="tok"
                        data-s={seg.s}
                        data-e={seg.e}
                        onClick={() => setActiveId(seg.entityId!)}
                      >
                        {seg.text}
                      </span>
                    ) : (
                      <span key={j} data-s={seg.s} data-e={seg.e}>
                        {seg.text}
                      </span>
                    ),
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div className="entity-card">
          <div className="card-row">
            <span className="badge">{active.type}</span>
            <code className="token">{active.token}</code>
            <span className="muted">{active.occurrences.length} 处</span>
            <span className="muted">来源：{originLabel(active.origin)}</span>
          </div>
          <div className="card-orig">{active.display}</div>
          <div className="card-actions">
            <button
              className="danger sm"
              onClick={() => {
                exclude(active.canonical);
                setActiveId(null);
              }}
            >
              撤销此项脱敏
            </button>
            <button className="ghost sm" onClick={() => setActiveId(null)}>
              关闭
            </button>
          </div>
          <p className="hint">撤销后该词在全文都不再脱敏；已撤销的项不会出现在导出稿里。</p>
        </div>
      )}

      <div className="actions-bar">
        <button className="ghost" onClick={onPrev}>
          上一步
        </button>
        <button className="primary" onClick={onNext}>
          生成脱敏稿
        </button>
      </div>
    </section>
  );
}

function originLabel(o: string): string {
  switch (o) {
    case 'rule':
      return '规则';
    case 'dict':
      return '词表';
    case 'alias':
      return '简称扩展';
    case 'manual':
      return '手动';
    default:
      return o;
  }
}
