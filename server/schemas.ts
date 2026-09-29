import { z } from "zod";
export const taskSchema = z.enum([
  "understand",
  "find",
  "draft",
  "review",
  "impact",
  "summarize",
]);
export const promptSchema = z.object({
  task: taskSchema,
  folder: z.string().max(400).optional(),
  document: z.string().max(400).optional(),
  changeId: z.number().int().positive().optional(),
  screen: z.string().max(200).optional(),
  instruction: z.string().max(4000).optional(),
  include: z
    .array(z.enum(["rationale", "evidence", "owners", "changes"]))
    .optional(),
});
export const changeSchema = z.object({
  title: z.string().trim().min(3).max(200),
  rationale: z.string().trim().min(3).max(10000),
  evidence: z.string().max(10000).optional(),
  files: z
    .array(
      z.object({
        path: z.string().max(400),
        content: z.string().min(1).max(2_000_000),
        baseHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
      }),
    )
    .min(1)
    .max(10),
  draft: z.boolean().optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export const settingsSchema = z.object({
  defaultTask: taskSchema,
  customizations: z.object({
    understand: z.string().max(4000),
    find: z.string().max(4000),
    draft: z.string().max(4000),
    review: z.string().max(4000),
    impact: z.string().max(4000),
    summarize: z.string().max(4000),
  }),
});
