import { useState } from 'react';
import type { Ledger } from '../types';
import { restoreText, type RestoreResult } from '../core/restore';

type Props = {
  ledger: Ledger;
  onPrev: () => void;
  onDone: (result: RestoreResult) => void;
};

export function PasteStep({ ledger, onPrev, onDone }: Props) {
  const [polished, setPolished] = useState('');
  const [loose, setLoose] = useState(false);

  const run = () => {
    if (!polished.trim()) return;
    onDone(restoreText(polished, ledger, { loose }));
  };

  return (
    <section className="step">
      <div className="notice">
        <b>把 AI 润色后的结果整段粘回这里。</b>
        还原是本地完成的：按账本把每个占位符换回原文，AI 看不到也拿不到真实信息。
        即使 AI 把 <code>〔机构_1〕</code> 改成了 <code>【机构1】</code> 或 <code>(机构 1)</code> 也能识别。
      </div>

      <div className="field">
        <div className="field-head">
          <span>润色稿</span>
          <span className="muted">{polished.length} 字 · 账本内 {ledger.entities.length} 个实体</span>
        </div>
        <textarea
          className="input paste-input"
          value={polished}
          spellCheck={false}
          placeholder="粘贴 AI 返回的全文…"
          onChange={(e) => setPolished(e.target.value)}
        />
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={loose} onChange={(e) => setLoose(e.target.checked)} />
        宽松匹配：同时识别被删掉括号的裸占位符（如 <code>机构_1</code>）
      </label>

      <div className="actions-bar">
        <button className="ghost" onClick={onPrev}>上一步</button>
        <button className="primary" onClick={run} disabled={!polished.trim()}>
          还原并检查
        </button>
      </div>
    </section>
  );
}
