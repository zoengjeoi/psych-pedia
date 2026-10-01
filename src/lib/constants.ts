// 分类 / 分组白名单已抽到 src/lib/taxonomy.mjs（生成脚本共用同一份），此处仅做转出
export {
  DRUG_CATEGORY_ORDER,
  RECEPTOR_GROUP,
  HYPOTHESIS_GROUP,
} from './taxonomy.mjs';

export const ENZYME_REGEX = /\b(?:CYP|UGT|MAO|COMT|FMO|CES)\d+[A-Z0-9]*\b/gi;

export const extractEnzymes = (text?: string): string[] => {
  if (!text) return [];
  const matches = text.match(ENZYME_REGEX) ?? [];
  return Array.from(new Set(matches.map((m) => m.toUpperCase())));
};
