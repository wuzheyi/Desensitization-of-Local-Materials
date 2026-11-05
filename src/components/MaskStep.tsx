import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EntityType, Ledger } from '../types';
import { splitAligned, statsByType, type HitSegment } from '../core/ledger';
import { findAllOccurrences, useSession } from '../store';

const TYPES: EntityType[] = [
  '机构', '人名', '项目', '证件', '电话', '邮箱', '账号', '地址', '信用代码',
  '股票代码', '域名', '网址', '车牌', 'IP', '金额', '比例', '数量', '日期', '其他',
];

type Props = { ledger: Ledger; onPrev: () => void; onNext: () => void };

interface Sel {
  start: number;
  end: number;
  text: string;
  /** 全文有多少处完全一致的内容——标记前就让用户知道会波及多少地方。 */
  count: number;
}

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
  const include = useSession((s) => s.include);
  const recent = useSession((s) => s.recent);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [selType, setSelType] = useState<EntityType>('机构');
  const [chipType, setChipType] = useState<EntityType | null>(null);
  const [lastExcluded, setLastExcluded] = useState<{
    canonical: string;
    label: string;
    count: number;
  } | null>(null);
  /** 标记完成 → 账本重算 → 再把结果选中，让用户看到「这条现在覆盖了几处」。 */
  const [pendingCanonical, setPendingCanonical] = useState<string | null>(null);

  const rows = useMemo(() => splitAligned(rawText, ledger), [rawText, ledger]);
  const stats = useMemo(() => statsByType(ledger), [ledger]);

  const totalOcc = ledger.entities.reduce((n, e) => n + e.occurrences.length, 0);
  const active = ledger.entities.find((e) => e.id === activeId) ?? null;
  const byType = chipType ? ledger.entities.filter((e) => e.type === chipType) : [];

  useEffect(() => {
    if (!pendingCanonical) return;
    const e = ledger.entities.find((x) => x.canonical === pendingCanonical);
    if (e) {
      setActiveId(e.id);
      setPendingCanonical(null);
    }
  }, [ledger, pendingCanonical]);

  /** 选中实体后把两栏一起滚到第一处出现的位置。 */
  const focusEntity = (id: string) => {
    setActiveId(id);
    requestAnimationFrame(() => {
      const el = document.querySelector(`.hit[data-eid="${id}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

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
    const text = rawText.slice(start, end).trim();
    if (!text) {
      setSel(null);
      return;
    }
    setSel({ start, end, text, count: findAllOccurrences(rawText, text).length });
  };

  const confirmManual = () => {
    if (!sel) return;
    const res = addManual(sel.start, sel.end, selType);
    setSel(null);
    setLastExcluded(null);
    window.getSelection()?.removeAllRanges();
    if (res.count > 0) setPendingCanonical(`${selType}|${sel.text}`);
  };

  const isNew = (s: number, e: number) =>
    recent.some((r) => r.kind === 'added' && r.start === s && r.end === e);

  /** 撤销后的位置已经不再是命中，切成带样式的片段才能标出「刚才撤的是这里」。 */
  const renderPlain = (seg: HitSegment, key: string) => {
    const marks = recent
      .filter((r) => r.kind === 'removed' && r.end > seg.s && r.start < seg.e)
      .sort((a, b) => a.start - b.start);

    if (marks.length === 0) {
      return (
        <span key={key} data-s={seg.s} data-e={seg.e}>
          {seg.text}
        </span>
      );
    }

    const parts: ReactNode[] = [];
    let cursor = seg.s;
    for (const m of marks) {
      const from = Math.max(m.start, seg.s);
      const to = Math.min(m.end, seg.e);
      if (from > cursor) {
        parts.push(
          <span key={`${key}-${cursor}`} data-s={cursor} data-e={from}>
            {rawText.slice(cursor, from)}
          </span>,
        );
      }
      parts.push(
        <span
          key={`${key}-m-${from}`}
          className="seg-restored"
          data-s={from}
          data-e={to}
          title="此处已撤销脱敏"
        >
          {rawText.slice(from, to)}
        </span>,
      );
      cursor = to;
    }
    if (cursor < seg.e) {
      parts.push(
        <span key={`${key}-tail`} data-s={cursor} data-e={seg.e}>
          {rawText.slice(cursor, seg.e)}
        </span>,
      );
    }
    return <Fragment key={key}>{parts}</Fragment>;
  };

  return (
    <section className="step">
      <div className="stats">
        <span className="stat-strong">{ledger.entities.length}</span> 个实体
        <span className="dot">·</span>
        <span className="stat-strong">{totalOcc}</span> 处命中
        <div className="chips">
          {stats.map((s) => (
            <button
              key={s.type}
              className={`chip${chipType === s.type ? ' active' : ''}`}
              onClick={() => setChipType(chipType === s.type ? null : s.type)}
              title="点击查看这一类具体命中了什么"
            >
              {s.type} <b>{s.occurrences}</b>
            </button>
          ))}
          {stats.length === 0 && <span className="muted">未识别到敏感信息，可在左侧手动标记</span>}
        </div>
      </div>

      {chipType && (
        <div className="type-panel">
          <div className="type-panel-head">
            <span>
              这一类的 <b>{chipType}</b> 共 {byType.length} 个实体、{stats.find((s) => s.type === chipType)?.occurrences} 处命中
            </span>
            <button className="link" onClick={() => setChipType(null)}>
              收起
            </button>
          </div>
          <div className="type-panel-body">
            {byType.map((e) => (
              <button
                key={e.id}
                className={`type-item${activeId === e.id ? ' active' : ''}`}
                onClick={() => focusEntity(e.id)}
              >
                <code className="type-token">{e.token}</code>
                <span className="type-name">{e.display}</span>
                <span className="type-occ">{e.occurrences.length} 处</span>
                <span className="type-origin">{originLabel(e.origin)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sel && (
        <div className="selbar">
          <span className="muted">
            已选「{sel.text.slice(0, 24)}
            {sel.text.length > 24 ? '…' : ''}」
          </span>
          <select value={selType} onChange={(e) => setSelType(e.target.value as EntityType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className={sel.count > 1 ? 'sel-count warn' : 'sel-count'}>
            全文 {sel.count} 处相同内容会一起脱敏
          </span>
          <button className="primary sm" onClick={confirmManual}>
            标记为敏感
          </button>
          <button className="ghost sm" onClick={() => setSel(null)}>
            取消
          </button>
        </div>
      )}

      {lastExcluded && (
        <div className="undo-bar">
          <span>
            已撤销「{lastExcluded.label}」全文 {lastExcluded.count} 处脱敏，位置见下方红框
          </span>
          <button
            className="link"
            onClick={() => {
              include(lastExcluded.canonical);
              setLastExcluded(null);
            }}
          >
            恢复脱敏
          </button>
          <button className="link" onClick={() => setLastExcluded(null)}>
            知道了
          </button>
        </div>
      )}

      <div className="compare" id="doc-raw" onMouseUp={handleSelect}>
        <div className="compare-head">
          <div>
            原文（仅存在本机内存）<span className="hint-inline">选中文字可全文同步脱敏</span>
          </div>
          <div>
            脱敏稿（可导出给 AI）
            <span className="hint-inline">点任一占位符可反查原文</span>
          </div>
        </div>
        <div className="compare-body">
          {rows.map((row, i) => (
            <div className="compare-row" key={i}>
              <div className="cell">
                {row.left.length === 0 ? (
                  <span className="pad"> </span>
                ) : (
                  row.left.map((seg, j) => {
                    if (seg.kind !== 'hit') return renderPlain(seg, `l${i}-${j}`);
                    const cls = [
                      'hit',
                      activeId === seg.entityId ? 'is-active' : '',
                      isNew(seg.s, seg.e) ? 'is-new' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <mark
                        key={j}
                        className={cls}
                        data-s={seg.s}
                        data-e={seg.e}
                        data-eid={seg.entityId}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveId(seg.entityId!);
                        }}
                      >
                        {seg.text}
                      </mark>
                    );
                  })
                )}
              </div>
              <div className="cell cell-right">
                {row.right.length === 0 ? (
                  <span className="pad"> </span>
                ) : (
                  row.right.map((seg, j) => {
                    if (seg.kind !== 'hit') return renderPlain(seg, `r${i}-${j}`);
                    const cls = [
                      'tok',
                      activeId === seg.entityId ? 'is-active' : '',
                      isNew(seg.s, seg.e) ? 'is-new' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <span
                        key={j}
                        className={cls}
                        data-s={seg.s}
                        data-e={seg.e}
                        data-eid={seg.entityId}
                        onClick={() => setActiveId(seg.entityId!)}
                      >
                        {seg.text}
                      </span>
                    );
                  })
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
                const spans = exclude(active.canonical);
                setActiveId(null);
                setLastExcluded({
                  canonical: active.canonical,
                  label: active.display,
                  count: spans.length,
                });
              }}
            >
              撤销此项脱敏（全 {active.occurrences.length} 处）
            </button>
            <button className="ghost sm" onClick={() => setActiveId(null)}>
              关闭
            </button>
          </div>
          <p className="hint">
            撤销后该内容在全文都不再脱敏，受影响的位置会用红框标出；已撤销的项不会出现在导出稿里。
          </p>
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
