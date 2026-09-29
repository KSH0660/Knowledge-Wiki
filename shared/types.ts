export type Policy = "local" | "cascade";
export type Task =
  | "explain"
  | "investigate"
  | "find"
  | "draft"
  | "review"
  | "impact"
  | "summarize"
  | "ingest";
export const tasks: Task[] = [
  "explain",
  "investigate",
  "find",
  "draft",
  "review",
  "impact",
  "summarize",
  "ingest",
];
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
export interface Workspace {
  slug: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
}
export interface WorkspaceSummary extends Workspace {
  rootOwnerId: string;
  documentCount: number;
  folderCount: number;
  revision: string;
  syncError: string | null;
  pendingReviews: number;
  fyiChanges: number;
  openImports: number;
}
export interface Folder {
  path: string;
  name: string;
  ownerId: string | null;
  policy: Policy | null;
  instructions: string;
  description: string;
  /** People notified about changes in this subtree. Never blocks publication. */
  watchers?: string[];
}
export interface ResolvedFolder extends Folder {
  effectiveOwnerId: string;
  ownerFrom: string;
  effectivePolicy: Policy;
  policyFrom: string;
  /** Required approvals. */
  approverIds: string[];
  /** FYI recipients: informed, never required. */
  fyiIds: string[];
  instructionLayers: { name: string; path: string; text: string }[];
  documentCount: number;
}
export type Provenance = Record<string, string>;
export interface Heading {
  level: number;
  title: string;
  number?: string;
  line: number;
  endLine: number;
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
  "draft" | "in_review" | "changes_requested" | "rejected" | "published";
export type Decision = "approve" | "request_changes" | "reject";
export interface Review {
  userId: string;
  decision: Decision;
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
  workspace: string;
  title: string;
  rationale: string;
  evidence: string;
  authorId: string;
  source: "human" | "agent";
  status: CRStatus;
  files: ProposedFile[];
  approverIds: string[];
  fyiIds: string[];
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
  /** Applied to every task. */
  global: string;
  customizations: Record<Task, string>;
}
export type ImportStatus = "open" | "submitted" | "committed" | "discarded";
export interface ImportSource {
  title?: string;
  uri?: string;
  version?: string;
  publisher?: string;
  description?: string;
}
export interface ImportSession {
  id: number;
  workspace: string;
  title: string;
  targetFolder: string;
  source: ImportSource;
  status: ImportStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  totalBytes: number;
  skipped: { path: string; reason: string }[];
  skippedCount: number;
  folders: { path: string; name: string; description: string }[];
  notes: string;
  suggestions: { title: string; detail: string }[];
  reviewerId?: string;
  decisionComment?: string;
  committedRevision?: string;
}
export interface ImportFileSummary {
  path: string;
  title: string;
  lines: number;
  bytes: number;
  kind: "markdown" | "normalized";
  sourcePath?: string;
  pages?: string;
}
export interface Catalog {
  user: User;
  users: User[];
  workspace: WorkspaceSummary;
  folders: ResolvedFolder[];
  documents: DocumentMeta[];
  changes: CRSummary[];
  imports: ImportSession[];
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
  section?: string;
  provenance: Provenance | null;
  folder: ResolvedFolder;
}
export type PromptSubject =
  | "portal"
  | "workspace"
  | "folder"
  | "document"
  | "change"
  | "compose"
  | "queue"
  | "governance"
  | "import"
  | "settings";
export interface PromptInput {
  workspace?: string;
  /** Omit to let the server choose the best task for the screen and the viewer. */
  task?: Task;
  screen?: string;
  /** Current page path, e.g. /w/acpi/documents?path=… (linked in the prompt). */
  page?: string;
  folder?: string;
  document?: string;
  changeId?: number;
  importId?: number;
  instruction?: string;
  include?: string[];
}
export interface PromptResult {
  task: Task;
  subject: PromptSubject;
  title: string;
  layers: { name: string; kind: string; text: string }[];
  /** Final Markdown prompt: exactly what is copied to the clipboard. */
  text: string;
}
export const taskLabels: Record<Task, string> = {
  explain: "Explain",
  investigate: "Investigate",
  find: "Find related",
  draft: "Draft CR",
  review: "Review",
  impact: "Impact check",
  summarize: "Summarize",
  ingest: "Ingest / migrate",
};
export const taskDescriptions: Record<Task, string> = {
  explain: "Explain what this covers, its requirements, and its terms",
  investigate: "Investigate a question with evidence from the knowledge",
  find: "Find related knowledge and explain why it matters",
  draft: "Draft a focused change request with evidence",
  review: "Review a proposal or import before the owner decides",
  impact: "Check what else is affected and who should know",
  summarize: "Summarize the current context and open questions",
  ingest: "Migrate a directory or ingest an external document via MCP",
};
