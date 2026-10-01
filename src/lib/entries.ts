import { getCollection, type CollectionEntry } from 'astro:content';
import {
  DRUG_CATEGORY_ORDER,
  HYPOTHESIS_GROUP,
  RECEPTOR_GROUP,
  extractEnzymes,
} from './constants';
import { isReceptorLike, type EntryRef, type WikiPattern } from './types';

export type DrugEntry = CollectionEntry<'drugs'>;
export type PrincipleEntry = CollectionEntry<'principles'>;

export const drugCategories = (drug: DrugEntry): string[] => {
  if (drug.data.categories && drug.data.categories.length > 0) return drug.data.categories;
  if (drug.data.category) return [drug.data.category];
  return ['未分类'];
};

export const principleGroup = (principle: PrincipleEntry): string =>
  isReceptorLike(principle.data.type) ? RECEPTOR_GROUP : HYPOTHESIS_GROUP;

export const getDrugs = async (): Promise<DrugEntry[]> =>
  (await getCollection('drugs')).sort((a, b) =>
    a.data.name_cn.localeCompare(b.data.name_cn, 'zh')
  );

export const getPrinciples = async (): Promise<PrincipleEntry[]> =>
  (await getCollection('principles')).sort((a, b) =>
    a.data.id.localeCompare(b.data.id)
  );

/** 首页/侧栏共用的分类分组（按主流分类顺序） */
export const groupDrugsByCategory = (
  drugs: DrugEntry[]
): [string, DrugEntry[]][] => {
  const grouped = new Map<string, DrugEntry[]>();
  for (const drug of drugs) {
    for (const cat of drugCategories(drug)) {
      const list = grouped.get(cat) ?? [];
      list.push(drug);
      grouped.set(cat, list);
    }
  }
  return Array.from(grouped.entries()).sort((a, b) => {
    const ia = DRUG_CATEGORY_ORDER.indexOf(a[0]);
    const ib = DRUG_CATEGORY_ORDER.indexOf(b[0]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
};

/** 受体自动链接模式：取标题首词为术语，长词优先 */
export const buildWikiPatterns = (principles: PrincipleEntry[]): WikiPattern[] =>
  principles
    .map((p) => ({
      id: p.data.id,
      term: p.data.title.split(' ')[0].trim(),
      fullTitle: p.data.title,
    }))
    .filter((p) => p.term.length >= 2)
    .sort((a, b) => b.term.length - a.term.length);

/** 传给客户端岛（侧栏导航 / 首页搜索）的轻量索引 */
export const buildEntryIndex = (
  drugs: DrugEntry[],
  principles: PrincipleEntry[]
): EntryRef[] => {
  const refs: EntryRef[] = [];
  for (const p of principles) {
    refs.push({
      id: p.data.id,
      kind: 'principle',
      cn: p.data.title,
      en: p.data.subtitle ?? '',
      groups: [principleGroup(p)],
    });
  }
  for (const d of drugs) {
    refs.push({
      id: d.data.id,
      kind: 'drug',
      cn: d.data.name_cn,
      en: d.data.name_en,
      groups: drugCategories(d),
    });
  }
  return refs;
};

export interface EnzymeGroup {
  enzyme: string;
  drugs: DrugEntry[];
}

/** 从所有药物的代谢途径聚合酶 -> 药物映射 */
export const buildEnzymeMap = async (): Promise<EnzymeGroup[]> => {
  const drugs = await getDrugs();
  const map = new Map<string, DrugEntry[]>();
  for (const drug of drugs) {
    for (const enzyme of extractEnzymes(drug.data.pk_data?.metabolism)) {
      const list = map.get(enzyme) ?? [];
      list.push(drug);
      map.set(enzyme, list);
    }
  }
  return Array.from(map.entries())
    .map(([enzyme, ds]) => ({ enzyme, drugs: ds }))
    .sort((a, b) => a.enzyme.localeCompare(b.enzyme));
};
