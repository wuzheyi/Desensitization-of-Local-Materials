import { useMemo, useState } from 'react';
import { useSession } from './store';
import { buildLedger } from './core/ledger';
import type { RestoreResult } from './core/restore';
import { ImportStep } from './components/ImportStep';
import { MaskStep } from './components/MaskStep';
import { ExportStep } from './components/ExportStep';
import { PasteStep } from './components/PasteStep';
import { ResultStep } from './components/ResultStep';

const STEPS = ['导入材料', '识别与对比', '导出脱敏稿', '粘回润色稿', '还原与导出'];

export default function App() {
  const rawText = useSession((s) => s.rawText);
  const candidates = useSession((s) => s.candidates);
  const excluded = useSession((s) => s.excluded);
  const reset = useSession((s) => s.reset);

  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const ledger = useMemo(() => {
    const usable = candidates.filter((c) => !excluded.includes(c.canonical));
    return buildLedger(rawText, usable);
  }, [rawText, candidates, excluded]);

  const go = (n: number) => {
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  };

  const restart = () => {
    reset();
    setResult(null);
    setStep(0);
    setMaxStep(0);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>尽调材料脱敏 · 可逆还原</h1>
          <p>把主体信息与金额比例替换成占位符，交给 AI 润色后，在本机还原回原始信息。</p>
        </div>
        <div className="topbar-right">
          <span className="pill">纯本地 · 无网络请求</span>
          {(rawText || step > 0) && (
            <button className="ghost sm" onClick={restart}>清空重来</button>
          )}
        </div>
      </header>

      <nav className="stepper">
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={`stepper-item${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
            disabled={i > maxStep}
            onClick={() => setStep(i)}
          >
            <span className="num">{i + 1}</span>
            <span className="label">{label}</span>
          </button>
        ))}
      </nav>

      <main>
        {step === 0 && <ImportStep onNext={() => go(1)} />}
        {step === 1 && <MaskStep ledger={ledger} onPrev={() => setStep(0)} onNext={() => go(2)} />}
        {step === 2 && <ExportStep ledger={ledger} onPrev={() => setStep(1)} onNext={() => go(3)} />}
        {step === 3 && (
          <PasteStep
            ledger={ledger}
            onPrev={() => setStep(2)}
            onDone={(r) => {
              setResult(r);
              go(4);
            }}
          />
        )}
        {step === 4 && result && <ResultStep result={result} onBack={() => setStep(3)} />}
      </main>

      <footer className="footnote">
        原始文本、实体账本与还原结果全部留在浏览器内存中，刷新页面即消失。
        页面不加载任何第三方脚本，也不发起网络请求 —— 打开本页后断开网络、再走一遍流程即可自行验证。
      </footer>
    </div>
  );
}
