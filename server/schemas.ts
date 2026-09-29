import { z } from "zod";
import { tasks, type Task } from "../shared/types.js";
export const taskSchema = z.enum(tasks as [Task, ...Task[]]);
export const promptSchema = z.object({
  workspace: z.string().max(40).optional(),
  task: taskSchema.optional(),
  folder: z.string().max(400).optional(),
  document: z.string().max(400).optional(),
  changeId: z.number().int().positive().optional(),
  importId: z.number().int().positive().optional(),
  screen: z.string().max(200).optional(),
  page: z
    .string()
    .max(1000)
    .regex(/^\/[^\s]*$/)
    .optional(),
  instruction: z.string().max(4000).optional(),
  include: z
    .array(z.enum(["rationale", "evidence", "owners", "changes"]))
    .optional(),
});
export const editSchema = z.object({
  old_text: z.string().min(1).max(200_000),
  new_text: z.string().max(200_000),
});
export const fileSchema = z
  .object({
    path: z.string().max(400),
    content: z.string().min(1).max(2_000_000).optional(),
    edits: z.array(editSchema).min(1).max(50).optional(),
    baseHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .refine((f) => (f.content === undefined) !== (f.edits === undefined), {
    message: "Provide either content or edits",
  });
export const changeSchema = z.object({
  title: z.string().trim().min(3).max(200),
  rationale: z.string().trim().min(3).max(10000),
  evidence: z.string().max(10000).optional(),
  files: z.array(fileSchema).min(1).max(10),
  draft: z.boolean().optional(),
  expectedVersion: z.number().int().positive().optional(),
});
const customization = z.string().max(4000);
export const settingsSchema = z.object({
  defaultTask: taskSchema,
  global: customization.default(""),
  customizations: z.object(
    Object.fromEntries(
      tasks.map((t) => [t, customization.default("")]),
    ) as Record<Task, z.ZodDefault<z.ZodString>>,
  ),
});
