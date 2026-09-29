export type Policy = "local" | "cascade";
export type Task =
  "understand" | "find" | "draft" | "review" | "impact" | "summarize";
export interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
  admin?: boolean;
}
export interface Actor {
  id: string;
  kind: "human" | "agent";
}
export interface Folder {
  path: string;
  name: string;
  ownerId: string | null;
  policy: Policy | null;
  instructions: string;
  description: string;
}
export interface ResolvedFolder extends Folder {
  effectiveOwnerId: string;
  ownerFrom: string;
  effectivePolicy: Policy;
  policyFrom: string;
  approverIds: string[];
  instructionLayers: { name: string; path: string; text: string }[];
  documentCount: number;
}
export interface DocumentMeta {
  path: string;
  title: string;
  folder: string;
  excerpt: string;
  lines: number;
  hash: string;
  updatedAt: string;
}
export interface ProposedFile {
  path: string;
  content: string;
  baseHash: string | null;
  original: string;
}
export type CRStatus =
  "draft" | "in_review" | "changes_requested" | "published";
export interface Review {
  userId: string;
  decision: "approve" | "request_changes";
  comment: string;
  at: string;
  version: number;
}
export interface Discussion {
  id: string;
  userId: string;
  text: string;
  at: string;
}
export interface ChangeRequest {
  id: number;
  title: string;
  rationale: string;
  evidence: string;
  authorId: string;
  source: "human" | "agent";
  status: CRStatus;
  files: ProposedFile[];
  approverIds: string[];
  reviews: Review[];
  reviewHistory?: Review[];
  comments: Discussion[];
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedRevision?: string;
}
export type CRSummary = Omit<ChangeRequest, "files"> & {
  files: { path: string; baseHash: string | null }[];
};
export interface PersonalSettings {
  defaultTask: Task;
  customizations: Record<Task, string>;
}
export interface Catalog {
  user: User;
  users: User[];
  folders: ResolvedFolder[];
  documents: DocumentMeta[];
  changes: CRSummary[];
  revision: string;
  syncedAt: string;
  syncError: string | null;
  demo: boolean;
}
export interface DocumentPage {
  path: string;
  title: string;
  content: string;
  revision: string;
  hash: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  nextLine: number | null;
  nextColumn: number;
  folder: ResolvedFolder;
}
export interface PromptInput {
  task: Task;
  folder?: string;
  document?: string;
  changeId?: number;
  screen?: string;
  instruction?: string;
  include?: string[];
}
export interface PromptResult {
  layers: { name: string; kind: string; text: string }[];
  text: string;
}
export const taskLabels: Record<Task, string> = {
  understand: "Understand a document",
  find: "Find related knowledge",
  draft: "Draft a change request",
  review: "Review a change request",
  impact: "Investigate impact",
  summarize: "Summarize this context",
};
