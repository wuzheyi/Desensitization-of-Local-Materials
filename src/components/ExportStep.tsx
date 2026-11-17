import { useMemo, useRef, useState } from 'react';
import type { Ledger } from '../types';
import { maskedText } from '../core/ledger';
import { buildPrompt, PROMPT_TEMPLATE } from '../core/prompt';
import { useSession } from '../store';
import { copyText, downloadText, timestampName } from '../export/text';

type Props = { ledger: Ledger; onPrev: () => void; onNext: () => void };

export function ExportStep({ ledger, onPrev, onNext }: Props) {
  const rawText = useSession((s) => s.rawText);
  const masked = useMemo(() => maskedText(rawText, ledger), [rawText, ledger]);
  const [prompt, setPrompt] = useState(PROMPT_TEMPLATE);
  const [msg, setMsg] = useState('');
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const nothingMasked = ledger.entities.length === 0;
  const combined = useMemo(() => buildPrompt(masked, prompt), [masked, prompt]);

  const flash = (t: string) => {
    setMsg(t);
    window.setTimeout(() => setMsg(''), 2600);
  };

  const doCopy = async (withPrompt: boolean) => {
    const ok = await copyText(withPrompt ? combined : masked);
    if (ok) {
      flash(withPrompt ? '已复制：提示词 + 脱敏稿' : '已复制脱敏稿');
      return;
    }
    // 自动复制被浏览器/沙箱拦截时，把结果放进提示词框并全选，用户按 Ctrl+C 即可
    const target = withPrompt ? promptRef.current : null;
    if (target) {
      target.value = combined;
      setPrompt(combined);
      target.focus();
      target.select();
    }
    flash('浏览器禁止了自动复制，文本已放入下方文本框并全选，请按 Ctrl+C');
  };

  const restorePrompt = () => {
    setPrompt(PROMPT_TEMPLATE);
    flash('已恢复默认提示词');
  };

  return (
    <section className="step">
      <div className="notice">
        <b>接下来：</b>把这份脱敏稿交给你的 AI 润色，再回到本工具粘回润色结果，即可还原成原始信息。
        下面的提示词要求 AI 原样保留 <code>〔类型_序号〕</code> 占位符；可自行修改，点「复制（含提示词）」会连同脱敏稿一起复制。
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

      <div className="field">
        <div className="field-head">
          <span>给 AI 的提示词（可修改）</span>
          <span className="muted">
            <button className="link" onClick={restorePrompt}>恢复默认</button>
            <span className="sep-dot">·</span>复制时会拼在脱敏稿前面
          </span>
        </div>
        <textarea
          ref={promptRef}
          className="input prompt-input"
          value={prompt}
          spellCheck={false}
          aria-label="给 AI 的提示词"
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="sel-hint">
          已拼好的完整内容共 {combined.length} 字，末尾就是上面的脱敏稿。
        </div>
      </div>

      <div className="actions-bar">
        <div className="btn-group">
          <button className="primary" onClick={() => void doCopy(true)}>复制（含提示词）</button>
          <button className="ghost" onClick={() => void doCopy(false)}>仅复制正文</button>
          <button
            className="ghost"
            onClick={() => downloadText(timestampName('脱敏稿', 'txt'), combined)}
          >
            下载 .txt（含提示词）
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
