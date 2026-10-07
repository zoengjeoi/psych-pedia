export interface StahlRadarData {
  labels?: string[];
  values?: number[];
  link_ids?: string[];
}

export interface Pearl {
  title: string;
  type: 'danger' | 'warning' | 'success' | 'info';
  content: string;
}

export interface DosageFormPK {
  formulation: string;
  half_life: string;
  peak_time?: string;
}

export interface PKData {
  half_life?: string;
  dosage_forms?: DosageFormPK[];
  protein_binding?: string;
  metabolism?: string;
  peak_time?: string;
  excretion?: string;
}

export interface MarketInfo {
  price?: string;
  insurance?: string;
  pregnancy?: string;
}

export interface DrugData {
  id: string;
  name_cn: string;
  name_en: string;
  category?: string;
  categories?: string[];
  tags: string[];
  stahl_radar?: StahlRadarData | null;
  pearls: Pearl[];
  pk_data?: PKData;
  market_info?: MarketInfo;
}

export interface PrincipleData {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  description?: string;
  visual_guide?: string;
  receptor_info?: {
    receptor_type: string;
    type_note?: string;
    synapse: string;
    synapse_note?: string;
    ligand: string;
    ligand_note?: string;
    brain_regions: string;
    regions_note?: string;
    interventions?: { mode: string; effect: string; clinic: string; drugs?: string[] }[];
    target_drugs?: { name: string; ki: string; note?: string }[];
    qa?: { q: string; a: string }[];
  };
}

export interface TocItem {
  depth: number;
  id: string;
  text: string;
}

export interface WikiPattern {
  id: string;
  term: string;
  fullTitle: string;
}

export type EntryKind = 'drug' | 'principle';

export interface EntryRef {
  id: string;
  kind: EntryKind;
  cn: string;
  en: string;
  /** 词条所属全部分类（药物可多分类；原理为 受体百科/生物学假说） */
  groups: string[];
}

export const isReceptorLike = (type?: string) =>
  type === 'receptor' || type === 'transporter' || type === 'ion_channel';
