/** 实体类型。中文命名，直接用于生成占位符，如 〔金额_3〕。 */
export type EntityType =
  | '机构'
  | '人名'
  | '项目'
  | '证件'
  | '电话'
  | '邮箱'
  | '账号'
  | '地址'
  | '信用代码'
  | '股票代码'
  | '域名'
  | '网址'
  | '车牌'
  | 'IP'
  | '金额'
  | '比例'
  | '数量'
  | '日期'
  | '其他';

/** 文本中的一次出现位置（基于 UTF-16 code unit 偏移，与 JS 字符串索引一致）。 */
export interface Occurrence {
  start: number;
  end: number;
  raw: string;
}

/** 候选命中：检测阶段的中间产物，尚未分配占位符。 */
export interface Candidate {
  start: number;
  end: number;
  type: EntityType;
  /** 归一化键。同 canonical 的候选合并为同一实体，共用一个占位符。 */
  canonical: string;
  /** 首次出现时的原始文本，还原时用它回填。 */
  display: string;
  origin: 'rule' | 'dict' | 'alias' | 'manual';
  /** 重叠裁剪时的优先级，数值越大越优先保留。 */
  priority: number;
}

/** 实体：账本中的一条记录。 */
export interface Entity {
  id: string;
  type: EntityType;
  canonical: string;
  display: string;
  token: string;
  occurrences: Occurrence[];
  origin: Candidate['origin'];
}

export interface Ledger {
  entities: Entity[];
}

/** 渲染用的文本片段。 */
export type Segment =
  | { kind: 'plain'; text: string }
  | { kind: 'token'; text: string; entityId: string };

/** 词表条目。`人名:张三` 可显式指定类型，不写则按名称特征推断。 */
export interface DictEntry {
  name: string;
  type: EntityType;
}

export interface DetectOptions {
  /** 自定义词表（公司名、关联方、内部人名等）。 */
  dict: DictEntry[];
  /** 是否对日期脱敏。默认关闭：抹掉时间会显著降低材料可读性。 */
  maskDates?: boolean;
  /** 带「人/家/户」等数量单位时，小于该值不脱敏，避免「3家子公司」被切碎。 */
  minQuantity?: number;
}
