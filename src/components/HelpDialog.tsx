import { useEffect, useRef } from 'react';

type Props = { open: boolean; onClose: () => void };

interface Step {
  /** 步骤名，和顶部步骤条一一对应。 */
  title: string;
  /** 这一步你能做的事。 */
  you: string[];
  /** 做完这一步手里会有什么。 */
  gain: string;
  /** 只有踩过才知道的细节，没必要时省略。 */
  tip?: string;
}

/**
 * 新手指引。内容必须和五个步骤条严格对应：
 * 用户点开是为了知道「现在这步该干什么、干完能得到什么」，
 * 所以每一步都按「你做 / 你得到」两段写，不写功能清单。
 */
const STEPS: Step[] = [
  {
    title: '导入材料',
    you: [
      '把 .docx / .txt / .md 拖进虚线框，或直接把正文粘进文本框；手头没有材料就点「载入示例」看效果。',
      '在正文里拖选任意一段文字，下方会浮出「识别为 ___ · 加入词表」，类型可改——这是补漏最快的办法。',
      '在主体清单里逐条核对：取消勾选 = 这条不脱敏；点名称可直接改字；下拉可改类型；✕ 删除。',
      '需要连日期一起抹掉时，勾选「同时脱敏日期」（默认关闭，抹掉时间会明显降低材料可读性）。',
    ],
    gain: '一份纯文本正文，和一份从正文里自动抽出的主体清单（默认全部勾选，带出现次数与来源）。文件在浏览器里解析，不会离开这台设备。',
    tip: '抽取是启发式的，宁可多勾也别漏勾：多勾的能在下一步一眼看见并撤销，漏勾的在正文里很难发现。',
  },
  {
    title: '识别与对比',
    you: [
      '左原文、右脱敏稿按行对齐，逐行比对。',
      '点左栏任意黄色命中，或右栏任意占位符，同一实体在全文的所有位置会一起高亮。',
      '点顶部「机构 6」「金额 5」这类标签可下钻，看这一类具体命中了哪些词、各几次、来自规则还是词表，点一条即定位到正文。',
      '发现没脱掉的敏感信息：直接在左栏拖选，选好类型点「标记为敏感」，全文相同内容一起脱敏（确认前会告诉你波及几处）。',
      '误伤了某一项：点它弹出卡片，选「撤销此项脱敏」，受影响位置用红框加删除线标出，可一键恢复。',
    ],
    gain: '一份你亲眼核对过的脱敏结果——谁被换掉了、换成了什么占位符、全文换了几处，都在这一页看得见。',
  },
  {
    title: '导出脱敏稿',
    you: [
      '点「复制（含提示词）」，把提示词和脱敏稿一起复制，粘给你自己的 AI（ChatGPT、Claude、豆包等都可以）。',
      '提示词可以改（核心那条是「占位符必须原样保留」），改坏了点「恢复默认」。',
      '也可以只复制正文，或下载 .txt 存档。',
    ],
    gain: '一段可以放心外发的文本：公司名、人名、金额、比例、证件号全变成 〔机构_1〕〔金额_2〕 这样的占位符，AI 看不到也拿不到真实信息。',
    tip: '如果浏览器拦截了自动复制，文本会被放进提示词框并全选，按 Ctrl+C 即可。',
  },
  {
    title: '粘回润色稿',
    you: [
      '把 AI 返回的全文整段粘回文本框。',
      '如果 AI 对占位符动得很厉害（比如把括号整个删了），勾上「宽松匹配」。',
    ],
    gain: '点「还原并检查」后，得到还原稿和一份逐条诊断。还原本来就该在这一步完成——占位符换回原文是本地做的，AI 全程没有真实信息。',
  },
  {
    title: '还原与导出',
    you: [
      '先看顶部结论，再逐条看三类清单：未出现的占位符（AI 删了）、无法识别的占位符（AI 自己编的）、正文里仍有残留。',
      '有问题就回上一步重粘；如果是漏脱了敏感信息，回第 2 步补标记后重新走一遍。',
      '通读一遍确认 AI 没有改动事实与数字，然后下载 .txt 或复制全文。',
    ],
    gain: '终稿——占位符被逐字换回真实信息，而真实信息从头到尾没有离开过你的电脑。',
  },
];

export function HelpDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  // onClose 由父组件内联传进来，每次渲染都是新函数；放进依赖会让 effect 反复执行、
  // 把焦点一次次抢回关闭按钮。用 ref 取值，effect 只跟 open 走。
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="help-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="help-head">
          <div className="help-head-text">
            <h2 id="help-title">使用说明</h2>
            <p>
              五步走完：本地脱敏 → 交给 AI 润色 → 本地还原。原始文本、实体账本和还原结果都只在浏览器内存里，
              不上传、不落盘、不发任何网络请求。
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="help-close"
            onClick={() => close.current()}
            aria-label="关闭使用说明"
          >
            ✕
          </button>
        </div>

        <div className="help-body">
          <div className="help-flow" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span className="help-flow-item" key={s.title}>
                <span className="help-flow-num">{i + 1}</span>
                {s.title}
                {i < STEPS.length - 1 && <span className="help-flow-arrow">→</span>}
              </span>
            ))}
          </div>

          {STEPS.map((s, i) => (
            <section className="help-step" key={s.title}>
              <div className="help-num" aria-hidden="true">{i + 1}</div>
              <div className="help-step-main">
                <h3>{s.title}</h3>
                <div className="help-label">这一步你做</div>
                <ul className="help-list">
                  {s.you.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <div className="help-gain">
                  <b>你会得到：</b>
                  {s.gain}
                </div>
                {s.tip && <div className="help-tip">提示：{s.tip}</div>}
              </div>
            </section>
          ))}

          <div className="help-notes">
            <h3>三件值得先知道的事</h3>
            <ul className="help-list">
              <li>
                <b>为什么能还原：</b>
                脱敏时每个占位符和原值的对应关系记在浏览器内存的「账本」里，还原就是照账本往回填。
                刷新页面账本即消失，所以别在中途刷新。
              </li>
              <li>
                <b>AI 一定会改占位符：</b>
                括号种类、下划线、空格、序号写法都可能被改（〔机构_1〕写成 【机构1】、(机构 1)），还原都认；
                只有它把占位符删掉、或自己编了新编号，才会在诊断里报出来。
              </li>
              <li>
                <b>不支持的材料：</b>
                扫描件 PDF 没有文本层，需先 OCR；.doc 旧格式请另存为 .docx；Excel 不支持。导出为纯文本，不保留原文档样式。
              </li>
            </ul>
          </div>
        </div>

        <div className="help-foot">
          <span className="muted">随时可以点标题右侧的「使用说明」再打开</span>
          <button type="button" className="primary sm" onClick={() => close.current()}>
            知道了，开始使用
          </button>
        </div>
      </div>
    </div>
  );
}
