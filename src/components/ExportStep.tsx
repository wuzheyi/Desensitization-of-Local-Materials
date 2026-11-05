import { useMemo, useState } from 'react';
import type { Ledger } from '../types';
import { maskedText } from '../core/ledger';
import { buildPrompt } from '../core/prompt';
import { useSession } from '../store';
import { copyText, downloadText, timestampName } from '../export/text';

type Props = { ledger: Ledger; onPrev: () => void; onNext: () => void };

export function ExportStep({ ledger, onPrev, onNext }: Props) {
  const rawText = useSession((s) => s.rawText);
  const masked = useMemo(() => maskedText(rawText, ledger), [rawText, ledger]);
  const [msg, setMsg] = useState('');

  const nothingMasked = ledger.entities.length === 0;

  const flash = (t: string) => {
    setMsg(t);
    window.setTimeout(() => setMsg(''), 2200);
  };

  const doCopy = async (withPrompt: boolean) => {
    const ok = await copyText(withPrompt ? buildPrompt(masked) : masked);
    flash(ok ? (withPrompt ? '已复制脱敏稿 + 提示词' : '已复制脱敏稿') : '复制失败，请手动选择复制');
  };

  return (
    <section className="step">
      <div className="notice">
        <b>接下来：</b>把这份脱敏稿交给你的 AI 润色，再回到本工具粘回润色结果，即可还原成原始信息。
        建议勾选「附带提示词」，它会要求 AI 原样保留 <code>〔类型_序号〕</code> 占位符并禁止改动数字。
      </div>

      {nothingMasked && (
        <div className="warn">当前没有识别到或手动标记任何敏感信息，导出的就是原文。建议返回上一步检查。</div>
      )}

      <div className="field">
        <div className="field-head">
          <span>脱敏稿</span>
          <span className="muted">{masked.length} 字 · {ledger.entities.length} 个实体</span>
        </div>
        <pre className="doc export-doc">{masked}</pre>
      </div>

      <div className="actions-bar">
        <div className="btn-group">
          <button className="primary" onClick={() => void doCopy(true)}>复制（含提示词）</button>
          <button className="ghost" onClick={() => void doCopy(false)}>仅复制正文</button>
          <button
            className="ghost"
            onClick={() => downloadText(timestampName('脱敏稿', 'txt'), masked)}
          >
            下载 .txt
          </button>
          {msg && <span className="flash">{msg}</span>}
        </div>
        <div className="btn-group">
          <button className="ghost" onClick={onPrev}>上一步</button>
          <button className="primary" onClick={onNext}>粘回润色稿</button>
        </div>
      </div>
    </section>
  );
}
