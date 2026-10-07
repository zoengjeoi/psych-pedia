/**
 * 内容 schema（单一事实源）：Astro Content Collections 与本地生成脚本共用。
 * 之所以放在 .mjs 而不是 .ts：Node 脚本（scripts/*.mjs）可以直接 import，
 * 无需转译；Astro 侧由 Vite 正常解析。
 */
import { z } from 'zod';

export const drugSchema = z.object({
  id: z.string(),
  name_cn: z.string(),
  name_en: z.string(),
  // 旧数据兼容：category(单) 与 categories(多) 并存
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).default([]),
  stahl_radar: z
    .object({
      labels: z.array(z.string()).optional(),
      values: z.array(z.number()).optional(),
      link_ids: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  pearls: z
    .array(
      z.object({
        title: z.string(),
        type: z.enum(['danger', 'warning', 'success', 'info']).default('info'),
        content: z.string(),
      })
    )
    .default([]),
  pk_data: z
    .object({
      half_life: z.string().optional(),
      dosage_forms: z
        .array(
          z.object({
            formulation: z.string(),
            half_life: z.string(),
            peak_time: z.string().optional(),
          })
        )
        .optional(),
      protein_binding: z.string().optional(),
      metabolism: z.string().optional(),
      peak_time: z.string().optional(),
      excretion: z.string().optional(),
    })
    .optional(),
  market_info: z
    .object({
      price: z.string().optional(),
      insurance: z.string().optional(),
      pregnancy: z.string().optional(),
    })
    .optional(),
});

/** 受体条目结构化信息（假说等非受体类型省略；缺省时页面回退旧版式） */
export const receptorInfoSchema = z.object({
  receptor_type: z.string(),
  type_note: z.string().optional(),
  synapse: z.string(),
  synapse_note: z.string().optional(),
  ligand: z.string(),
  ligand_note: z.string().optional(),
  brain_regions: z.string(),
  regions_note: z.string().optional(),
  interventions: z
    .array(
      z.object({
        mode: z.string(),
        effect: z.string(),
        clinic: z.string(),
        drugs: z.array(z.string()).default([]),
      })
    )
    .default([]),
  target_drugs: z
    .array(
      z.object({
        name: z.string(),
        ki: z.string(),
        note: z.string().optional(),
      })
    )
    .default([]),
  qa: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
});

export const principleSchema = z.object({
  id: z.string(),
  type: z.string().default('hypothesis'),
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  visual_guide: z.string().optional(),
  receptor_info: receptorInfoSchema.optional(),
});
