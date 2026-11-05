import { useMemo } from 'react';
import type { RestoreResult } from '../core/restore';
import { copyText, downloadText, timestampName } from '../export/text';

type Props = { result: RestoreResult; onBack: () => void };

const LEFTOVER_RE =
  /(?:〔|\[|【|（|\()\s*(?:机构|人名|证件|电话|邮箱|账号|地址|信用代码|股票代码|域名|网址|车牌|IP|金额|比例|数量|日期)\s*[_\-\s]?\s*\d{1,4}\s*(?:〕|\]|】|）|\))/g;

export function ResultStep({ result, onBack }: Props) {
  const leftover = useMemo(() => result.text.match(LEFTOVER_RE) ?? [], [result.text]);
  const { missing, unknown, replaced } = result.report;
  const hasIssue = missing.length > 0 || unknown.length > 0 || leftover.length > 0;

  return (
    <section className="step">
      <div className={`verdict ${hasIssue ? 'warn' : 'ok'}`}>
        {hasIssue ? (
          <>
            <b>已还原 {replaced} 处，但有 {missing.length + unknown.length + leftover.length} 个占位符未能还原。</b>
            请检查下方清单：可能是 AI 删掉了占位符、改动了写法，或自行生成了新的占位符。
          </>
        ) : (
          <>
            <b>还原完成：{replaced} 处占位符全部换回原文。</b>
            导出前建议再通读一遍，确认 AI 没有改动事实与数字。
          </>
        )}
      </div>

      {missing.length > 0 && (
        <div className="field">
          <div className="field-head">
            <span>未出现的占位符（{missing.length}）</span>
            <span className="muted">AI 可能删掉了这些位置，还原时无处可填</span>
          </div>
          <ul className="diag-list">
            {missing.map((m) => (
              <li key={m.token}>
                <code>{m.token}</code>
                <span className="diag-orig">{m.display}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unknown.length > 0 && (
        <div className="field">
          <div className="field-head">
            <span>无法识别的占位符（{unknown.length}）</span>
            <span className="muted">账本里没有对应实体，AI 可能自行生成了编号</span>
          </div>
          <ul className="diag-list">
            {unknown.map((u) => (
              <li key={u}>
                <code>{u}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {leftover.length > 0 && (
        <div className="field">
          <div className="field-head">
            <span>正文中仍有占位符残留（{leftover.length}）</span>
          </div>
          <ul className="diag-list">
            {Array.from(new Set(leftover)).map((l) => (
              <li key={l}>
                <code>{l}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field">
        <div className="field-head">
          <span>还原稿</span>
          <span className="muted">{result.text.length} 字</span>
        </div>
        <pre className="doc export-doc">{result.text}</pre>
      </div>

      <div className="actions-bar">
        <div className="btn-group">
          <button
            className="primary"
            onClick={() => downloadText(timestampName('还原稿', 'txt'), result.text)}
          >
            下载 .txt
          </button>
          <button className="ghost" onClick={() => void copyText(result.text)}>复制全文</button>
        </div>
        <button className="ghost" onClick={onBack}>重新粘回</button>
      </div>
    </section>
  );
}
