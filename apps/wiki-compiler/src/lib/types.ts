export type Folder =
  | "raw"
  | "wiki"
  | "output"
  | "Daily"
  | "Notes"
  | "Clippings"
  | "References"
  | "Categories"
  | "root";

export type NoteType =
  | "daily"
  | "note"
  | "clipping"
  | "reference"
  | "category"
  | "profile"
  | "index"
  | "log"
  | "brief"
  | "raw"
  | "contradiction";

export type Frontmatter = {
  title: string;
  created?: string;
  updated?: string;
  categories?: string[];
  type?: NoteType | string;
  rating?: number;
  tags?: string[];
  author?: string;
  url?: string;
  status?: string;
  sources?: string[];
  claims?: string[];
  compiledFrom?: string[];
};

export type VaultNote = {
  path: string;
  folder: Folder;
  filename: string;
  title: string;
  frontmatter: Frontmatter;
  body: string;
  raw: string;
};

export type Wikilink = {
  raw: string;
  target: string;
  alias?: string;
  start: number;
  end: number;
};

export type Backlink = {
  fromPath: string;
  fromTitle: string;
  target: string;
};

export type ClaimPolarity = "affirm" | "deny";

export type Claim = {
  id: string;
  subject: string;
  polarity: ClaimPolarity;
  statement: string;
  sourceId?: string;
  sourceTitle?: string;
  categories?: string[];
};

export type Contradiction = {
  id: string;
  subject: string;
  left: Claim;
  right: Claim;
  notePath: string;
};

export type SkillId =
  | "clip-cleaner"
  | "markdown-linkify"
  | "bases-refresh"
  | "canvas-rewrite"
  | "contradiction-checker";

export type SkillToggles = Record<SkillId, boolean>;

export type CompilePhase =
  | "extract"
  | "link"
  | "categorize"
  | "detect-contradictions"
  | "update-index"
  | "compile-brief"
  | "canvas"
  | "profile"
  | "bases";

export type CompileStepStatus = "ran" | "skipped";

export type CompileTraceStep = {
  id: string;
  phase: CompilePhase;
  title: string;
  skill?: SkillId;
  status: CompileStepStatus;
  durationMs: number;
  summary: string;
  details: string[];
};

export type WikiChange = {
  path: string;
  kind: "added" | "updated" | "removed";
  before?: string;
  after?: string;
};

export type WikiDiff = {
  changes: WikiChange[];
};

export type SourceKind = "article" | "clipping" | "meeting" | "daily" | "reference";

export type RawSource = {
  id: string;
  title: string;
  kind: SourceKind;
  html?: string;
  markdown: string;
  claims: Claim[];
  suggestedFolder: Folder;
  suggestedCategories: string[];
  suggestedRating: number;
  created: string;
  author?: string;
  aliases?: Record<string, string>;
};

export type FilterOp = "eq" | "neq" | "gte" | "lte" | "contains" | "in";

export type PropertyFilter =
  | { field: string; op: FilterOp; value: unknown }
  | { and: PropertyFilter[] }
  | { or: PropertyFilter[] };

export type BasesDisplay = "table" | "cards";

export type BasesView = {
  id: string;
  name: string;
  groupBy?: string;
  sort?: { field: string; dir: "asc" | "desc" };
  filters: PropertyFilter;
  display: BasesDisplay;
};

export type BasesRow = {
  path: string;
  title: string;
  type: string;
  category: string;
  categories: string[];
  rating: number | null;
  date: string;
  folder: Folder;
  tags: string[];
};

export type CanvasColor = "1" | "2" | "3" | "4" | "5" | "6" | string;

export type CanvasNodeType = "text" | "file" | "link" | "group";

export type CanvasSide = "top" | "right" | "bottom" | "left";
export type CanvasEnd = "none" | "arrow";
export type CanvasBackgroundStyle = "cover" | "ratio" | "repeat";

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: CanvasBackgroundStyle;
};

export type CanvasEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toSide?: CanvasSide;
  toEnd?: CanvasEnd;
  color?: CanvasColor;
  label?: string;
};

export type JsonCanvas = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export type YearlyQuestion = {
  id: string;
  prompt: string;
};

export type Citation = {
  path: string;
  title: string;
};

export type YearlyAnswer = {
  questionId: string;
  prompt: string;
  draft: string;
  citations: Citation[];
};

export type Vault = {
  notes: VaultNote[];
  compiledSourceIds: string[];
  canvas: JsonCanvas;
  basesViews: BasesView[];
  basesSnapshot: BasesRow[] | null;
  contradictions: Contradiction[];
  claims: Claim[];
  lastCompileAt: string | null;
  lastTrace: CompileTraceStep[];
};

export const SKILL_IDS: SkillId[] = [
  "clip-cleaner",
  "markdown-linkify",
  "bases-refresh",
  "canvas-rewrite",
  "contradiction-checker",
];

export const DEFAULT_SKILLS: SkillToggles = {
  "clip-cleaner": true,
  "markdown-linkify": true,
  "bases-refresh": true,
  "canvas-rewrite": true,
  "contradiction-checker": true,
};

export const FOLDERS: Folder[] = [
  "raw",
  "wiki",
  "output",
  "Daily",
  "Notes",
  "Clippings",
  "References",
  "Categories",
  "root",
];
