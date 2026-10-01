import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// schema 定义抽到 src/lib/content-schema.mjs，供本地生成脚本（scripts/*.mjs）共用
import { drugSchema, principleSchema } from './lib/content-schema.mjs';

const drugs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/drugs' }),
  schema: drugSchema,
});

const principles = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/principles' }),
  schema: principleSchema,
});

export const collections = { drugs, principles };
