import { useEffect, useMemo, useState } from "react";
import { YEARLY_QUESTIONS } from "../data/questions.ts";
import { RAW_SOURCES } from "../data/sources.ts";
import { applyView, groupRows, noteToRow } from "../lib/bases.ts";
import { compile, ingestDropped } from "../lib/compiler.ts";
import { unifiedHunk } from "../lib/diff.ts";
import { MarkdownView } from "../lib/markdown.tsx";
import { SKILL_CATALOG } from "../lib/skills.ts";
import { extractSourceBody } from "../lib/skills.ts";
import type {
  CompilePhase,
  CompileTraceStep,
  RawSource,
  SkillToggles,
  Vault,
  VaultNote,
  WikiDiff,
  YearlyAnswer,
} from "../lib/types.ts";
import { FOLDERS } from "../lib/types.ts";
import { getNote, makeNote, notesIn, upsertNote } from "../lib/vault.ts";
import { backlinksTo, resolveWikilink } from "../lib/wikilink.ts";
import { draftYearlyAnswers } from "../lib/yearly.ts";
import { CanvasMap, exportCanvasFile } from "./CanvasMap.tsx";
import { fresh, loadState, saveState } from "./storage.ts";

type Tab =
  | "ingest"
  | "compile"
  | "vault"
  | "bases"
  | "canvas"
  | "skills"
  | "review"
  | "profile";

const TABS: { id: Tab; label: string }[] = [
  { id: "ingest", label: "Ingest" },
  { id: "compile", label: "Compile" },
  { id: "vault", label: "Vault" },
  { id: "bases", label: "Bases" },
  { id: "canvas", label: "Canvas" },
  { id: "skills", label: "Skills" },
  { id: "review", label: "Yearly review" },
  { id: "profile", label: "Profile" },
];

export function App() {
  const initial = useMemo(() => loadState(), []);
  const [vault, setVault] = useState<Vault>(initial.vault);
  const [skills, setSkills] = useState<SkillToggles>(initial.skills);
  const [theme, setTheme] = useState<"light" | "dark">(initial.theme);
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<Tab>("ingest");
  const [picked, setPicked] = useState<string[]>(RAW_SOURCES.slice(0, 4).map((source) => source.id));
  const [extras, setExtras] = useState<RawSource[]>([]);
  const [hot, setHot] = useState(false);
  const [trace, setTrace] = useState<CompileTraceStep[]>(initial.vault.lastTrace);
  const [diff, setDiff] = useState<WikiDiff | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [notePath, setNotePath] = useState<string | null>("root/Living profile.md");
  const [viewId, setViewId] = useState(initial.vault.basesViews[0]?.id ?? "all-compiled");
  const [yearlyIds, setYearlyIds] = useState<string[]>(YEARLY_QUESTIONS.slice(0, 4).map((item) => item.id));
  const [answers, setAnswers] = useState<YearlyAnswer[]>([]);

  const library = [...RAW_SOURCES, ...extras];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    saveState({ vault, skills, theme });
  }, [vault, skills, theme]);

  function openNote(target: string) {
    const resolved = resolveWikilink(vault.notes, target) ?? getNote(vault, target);
    if (resolved) {
      setNotePath(resolved.path);
      setTab("vault");
    }
  }

  async function runCompile() {
    const selected = library.filter((source) => picked.includes(source.id));
    const sources = selected.length ? selected : library;
    setCompiling(true);
    setTab("compile");
    setTrace([]);
    const result = compile({ vault, sources, skills, now: today() });
    for (const step of result.steps) {
      await sleep(step.durationMs);
      setTrace((current) => [...current, step]);
    }
    setVault(result.vault);
    setDiff(result.diff);
    setCompiling(false);
  }

  function dropSelected() {
    const selected = library.filter((source) => picked.includes(source.id));
    let next = vault;
    for (const source of selected) {
      const body = extractSourceBody(source, skills);
      next = upsertNote(
        next,
        makeNote(
          `raw/${source.title}.md`,
          {
            title: source.title,
            type: "raw",
            created: source.created,
            author: source.author,
            sources: [source.id],
            tags: [source.kind],
          },
          body,
        ),
      );
    }
    setVault(next);
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const added: RawSource[] = [];
    for (const file of [...files]) {
      const text = await file.text();
      const source = ingestDropped(file.name, text, today());
      added.push(source);
    }
    setExtras((current) => [...current, ...added]);
    setPicked((current) => [...current, ...added.map((source) => source.id)]);
  }

  const note = notePath ? getNote(vault, notePath) : undefined;
  const view = vault.basesViews.find((item) => item.id === viewId) ?? vault.basesViews[0]!;
  const liveRows = applyView(vault.notes.map(noteToRow), view);
  const rows = skills["bases-refresh"] || !vault.basesSnapshot ? liveRows : filterSnapshot(vault, view);
  const stale = !skills["bases-refresh"] && vault.basesSnapshot !== null && vault.lastCompileAt !== null;

  return (
    <div className={`app${focus ? " focus" : ""}`}>
      <aside className="rail">
        <div className="brand">
          <small>compiled second brain</small>
          <strong>wiki-compiler</strong>
        </div>
        <nav className="nav">
          {TABS.map((item) => (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <p className="credits muted">
          Mock compiler. No LLM, no network. Flexoki palette · kepano vault ideas · JSON Canvas.
        </p>
      </aside>
      <div className="main">
        <header className="top">
          <div>
            <h1>{titleFor(tab)}</h1>
            <p>{subtitleFor(tab, vault, compiling)}</p>
          </div>
          <div className="tools">
            <button className="ghost" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? "Ink" : "Paper"}
            </button>
            <button className="ghost" onClick={() => setFocus((value) => !value)}>
              {focus ? "Exit focus" : "Focus"}
            </button>
            <button
              className="ghost danger"
              onClick={() => {
                const reset = fresh();
                setVault(reset.vault);
                setSkills(reset.skills);
                setTrace([]);
                setDiff(null);
                setAnswers([]);
              }}
            >
              Reset vault
            </button>
            <button className="stamp" disabled={compiling} onClick={() => void runCompile()}>
              {compiling ? "Compiling…" : "Run compile"}
            </button>
          </div>
        </header>
        <section className="stage">{renderTab()}</section>
      </div>
    </div>
  );

  function renderTab() {
    switch (tab) {
      case "ingest":
        return (
          <div className="grid two">
            <div className="card">
              <div className="kicker">raw/</div>
              <h2>Mock sources</h2>
              <p className="muted">Select articles, clippings, and meeting notes. Two pairs contradict on purpose.</p>
              <div className="sources" style={{ marginTop: 12 }}>
                {library.map((source) => {
                  const on = picked.includes(source.id);
                  return (
                    <label key={source.id} className={`source${on ? " picked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((current) =>
                            on ? current.filter((id) => id !== source.id) : [...current, source.id],
                          )
                        }
                      />
                      <span>
                        <strong>{source.title}</strong>
                        <div className="muted">
                          {source.kind} · {source.created}
                          {source.claims.some((claim) => claim.polarity === "deny") ? " · contradicts a sibling" : ""}
                        </div>
                      </span>
                      <span className="chip">{source.suggestedFolder}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="card">
              <div className="kicker">input buffer</div>
              <h2>Drop into raw/</h2>
              <div
                className={`drop${hot ? " hot" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setHot(true);
                }}
                onDragLeave={() => setHot(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setHot(false);
                  void onFiles(event.dataTransfer.files);
                }}
              >
                <p>Drop a local .md file, or stage the selected mock sources.</p>
                <div className="tools" style={{ justifyContent: "center", marginTop: 12 }}>
                  <button className="stamp" onClick={dropSelected}>
                    Stage selected in raw/
                  </button>
                  <label className="ghost">
                    Choose file
                    <input
                      type="file"
                      accept=".md,text/markdown,text/plain"
                      hidden
                      onChange={(event) => void onFiles(event.target.files)}
                    />
                  </label>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 14 }}>
                Staged raw notes: {notesIn(vault, "raw").length}. Compile turns the buffer into wiki pages.
              </p>
            </div>
          </div>
        );
      case "compile":
        return (
          <div className="grid two">
            <div className="card">
              <div className="kicker">agent trace</div>
              <h2>extract → link → categorize → contradictions → index → brief</h2>
              <div className="trace">
                {trace.length === 0 && <p className="muted">Run compile to stream the deterministic agent steps.</p>}
                {trace.map((step) => (
                  <article key={step.id} className={`step ${step.status}`}>
                    <header>
                      <strong>
                        {phaseLabel(step.phase)} · {step.title}
                      </strong>
                      <span className={`chip${step.status === "skipped" ? " warn" : " ok"}`}>
                        {step.status}
                        {step.skill ? ` · ${step.skill}` : ""}
                      </span>
                    </header>
                    <ul>
                      {step.details.map((line, index) => (
                        <li key={`${step.id}-${index}`}>{line}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
            <div className="card diff">
              <div className="kicker">wiki diff</div>
              <h2>{diff ? `${diff.changes.length} path(s) changed` : "No compile yet"}</h2>
              {(diff?.changes ?? []).slice(0, 12).map((change) => (
                <div key={change.path} style={{ marginBottom: 14 }}>
                  <div className="mono muted">
                    {change.kind} · {change.path}
                  </div>
                  <pre className="hunk">
                    {unifiedHunk(change).map((line, index) => (
                      <div
                        key={`${change.path}-${index}`}
                        className={line.startsWith("+") ? "plus" : line.startsWith("-") ? "minus" : ""}
                      >
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        );
      case "vault":
        return (
          <div className="grid two">
            <div className="card">
              <div className="kicker">kepano-style folders</div>
              <h2>Vault</h2>
              <div className="tree">
                {FOLDERS.filter((folder) => folder !== "root").map((folder) => (
                  <div key={folder}>
                    <strong>{folder}/</strong>
                    {notesIn(vault, folder).map((item) => (
                      <button
                        key={item.path}
                        className={item.path === notePath ? "on" : ""}
                        onClick={() => setNotePath(item.path)}
                      >
                        {item.filename}
                      </button>
                    ))}
                  </div>
                ))}
                <div>
                  <strong>root/</strong>
                  {vault.notes
                    .filter((item) => item.folder === "root")
                    .map((item) => (
                      <button
                        key={item.path}
                        className={item.path === notePath ? "on" : ""}
                        onClick={() => setNotePath(item.path)}
                      >
                        {item.filename}
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <div className="card note-view">
              {note ? <NotePane note={note} notes={vault.notes} onOpen={openNote} /> : <p className="muted">Pick a note.</p>}
            </div>
          </div>
        );
      case "bases":
        return (
          <div className="card">
            <div className="kicker">saved views</div>
            <h2>{view.name}</h2>
            {stale && <p className="chip warn">Bases refresh off — showing last snapshot, which may be stale.</p>}
            <div className="tools" style={{ margin: "10px 0 16px" }}>
              {vault.basesViews.map((item) => (
                <button
                  key={item.id}
                  className={item.id === view.id ? "stamp" : "ghost"}
                  onClick={() => setViewId(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            {view.display === "cards" ? (
              <div className="cards">
                {rows.map((row) => (
                  <button key={row.path} className="note-card" onClick={() => openNote(row.path)}>
                    <div className="kicker">{row.type}</div>
                    <strong>{row.title}</strong>
                    <div className="muted">{row.category || row.folder}</div>
                    <Rating value={row.rating} />
                  </button>
                ))}
              </div>
            ) : view.groupBy ? (
              [...groupRows(rows, view.groupBy)].map(([key, group]) => (
                <div key={key} style={{ marginBottom: 18 }}>
                  <h3>{key || "(empty)"}</h3>
                  <RowTable rows={group} onOpen={openNote} />
                </div>
              ))
            ) : (
              <RowTable rows={rows} onOpen={openNote} />
            )}
          </div>
        );
      case "canvas":
        return (
          <div className="card">
            <div className="kicker">jsoncanvas 1.0</div>
            <h2>Knowledge map</h2>
            <p className="muted">Auto-rewritten after compile when the canvas skill is on. Drag file nodes. Export is a valid .canvas file.</p>
            <div className="tools" style={{ margin: "10px 0 14px" }}>
              <button className="ghost" onClick={() => exportCanvasFile(vault.canvas)}>
                Export knowledge-map.canvas
              </button>
              <span className="chip">
                {vault.canvas.nodes.length} nodes · {vault.canvas.edges.length} edges
              </span>
            </div>
            <CanvasMap canvas={vault.canvas} onChange={(canvas) => setVault({ ...vault, canvas })} />
          </div>
        );
      case "skills":
        return (
          <div className="grid two">
            <div className="card">
              <div className="kicker">plugin-like pure functions</div>
              <h2>Skills</h2>
              <p className="muted">Disable one and recompile — extract, links, contradictions, canvas, or Bases snapshot will change.</p>
              {SKILL_CATALOG.map((skill) => (
                <div className="skill" key={skill.id}>
                  <div>
                    <strong>{skill.name}</strong>
                    <div className="muted">{skill.summary}</div>
                  </div>
                  <button
                    className={`toggle${skills[skill.id] ? " on" : ""}`}
                    onClick={() => setSkills({ ...skills, [skill.id]: !skills[skill.id] })}
                    aria-pressed={skills[skill.id]}
                  >
                    <span />
                  </button>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="kicker">last compile log</div>
              <h2>Step log</h2>
              <div className="trace">
                {(vault.lastTrace.length ? vault.lastTrace : trace).map((step) => (
                  <article key={step.id} className={`step ${step.status}`}>
                    <header>
                      <strong>{step.title}</strong>
                      <span className="chip">{step.status}</span>
                    </header>
                    <p className="muted">{step.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        );
      case "review":
        return (
          <div className="grid two">
            <div className="card">
              <div className="kicker">yearly review</div>
              <h2>Ask the compiled wiki</h2>
              <p className="muted">Original prompts for this demo. Answers are drafted from compiled evidence with wikilink citations.</p>
              <div className="questions" style={{ marginTop: 12 }}>
                {YEARLY_QUESTIONS.map((question) => (
                  <label key={question.id} className="source">
                    <input
                      type="checkbox"
                      checked={yearlyIds.includes(question.id)}
                      onChange={() =>
                        setYearlyIds((current) =>
                          current.includes(question.id)
                            ? current.filter((id) => id !== question.id)
                            : [...current, question.id],
                        )
                      }
                    />
                    <span>{question.prompt}</span>
                  </label>
                ))}
              </div>
              <button
                className="stamp"
                style={{ marginTop: 14 }}
                onClick={() => setAnswers(draftYearlyAnswers(vault, yearlyIds))}
              >
                Draft from wiki
              </button>
            </div>
            <div className="card">
              <div className="kicker">evidence</div>
              <h2>Drafts</h2>
              {answers.length === 0 && <p className="muted">Pick questions and draft.</p>}
              {answers.map((answer) => (
                <article key={answer.questionId} className="answer">
                  <strong>{answer.prompt}</strong>
                  <p>{answer.draft}</p>
                  <div className="tools">
                    {answer.citations.map((cite) => (
                      <button key={cite.path} className="ghost" onClick={() => openNote(cite.path)}>
                        [[{cite.title}]]
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      case "profile": {
        const profile = getNote(vault, "root/Living profile.md");
        return (
          <div className="card note-view">
            <div className="kicker">living profile</div>
            <h2>Rewritten by compiles</h2>
            {profile ? (
              <MarkdownView text={profile.body} onOpen={openNote} />
            ) : (
              <p className="muted">Profile missing.</p>
            )}
          </div>
        );
      }
      default: {
        const _exhaustive: never = tab;
        return _exhaustive;
      }
    }
  }
}

function NotePane({
  note,
  notes,
  onOpen,
}: {
  note: VaultNote;
  notes: VaultNote[];
  onOpen: (target: string) => void;
}) {
  const backs = backlinksTo(notes, note.path);
  return (
    <>
      <div className="kicker">{note.path}</div>
      <h2>{note.title}</h2>
      <Rating value={note.frontmatter.rating ?? null} />
      <pre className="frontmatter mono">{yamlPreview(note)}</pre>
      <MarkdownView text={note.body} onOpen={onOpen} />
      <div>
        <div className="kicker">backlinks</div>
        {backs.length === 0 && <p className="muted">No backlinks yet.</p>}
        <div className="tools">
          {backs.map((link, index) => (
            <button key={`${link.fromPath}-${index}`} className="ghost" onClick={() => onOpen(link.fromPath)}>
              [[{link.fromTitle}]]
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function RowTable({
  rows,
  onOpen,
}: {
  rows: ReturnType<typeof noteToRow>[];
  onOpen: (path: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Category</th>
            <th>Rating</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path} className="clickable" onClick={() => onOpen(row.path)}>
              <td>{row.title}</td>
              <td>{row.type}</td>
              <td>{row.category}</td>
              <td>
                <Rating value={row.rating} />
              </td>
              <td className="mono">{row.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rating({ value }: { value: number | null }) {
  const n = value ?? 0;
  return (
    <span className="rating" title={value ? `${value}/7` : "unrated"}>
      {Array.from({ length: 7 }, (_, index) => (
        <i key={index} className={index < n ? "on" : ""} />
      ))}
    </span>
  );
}

function yamlPreview(note: VaultNote): string {
  const fm = note.frontmatter;
  return [
    `title: ${fm.title}`,
    fm.type ? `type: ${fm.type}` : "",
    typeof fm.rating === "number" ? `rating: ${fm.rating}` : "",
    fm.created ? `created: ${fm.created}` : "",
    ...(fm.categories ?? []).map((item) => `category: ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function filterSnapshot(vault: Vault, view: Vault["basesViews"][number]) {
  return applyView(vault.basesSnapshot ?? vault.notes.map(noteToRow), view);
}

function titleFor(tab: Tab): string {
  switch (tab) {
    case "ingest":
      return "Ingest";
    case "compile":
      return "Compile loop";
    case "vault":
      return "Vault";
    case "bases":
      return "Bases";
    case "canvas":
      return "JSON Canvas";
    case "skills":
      return "Skills";
    case "review":
      return "Yearly review";
    case "profile":
      return "Living profile";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function subtitleFor(tab: Tab, vault: Vault, compiling: boolean): string {
  switch (tab) {
    case "ingest":
      return "Raw is a buffer. Nothing here is knowledge until compile.";
    case "compile":
      return compiling ? "Agent steps are local fixtures, not a live model." : `Last compile ${vault.lastCompileAt ?? "—"}`;
    case "vault":
      return "Markdown + YAML · wikilinks · 1–7 ratings · backlinks.";
    case "bases":
      return "Filter, sort, group by properties. Table or cards.";
    case "canvas":
      return "Spec-valid nodes and edges. Drag to rearrange.";
    case "skills":
      return "Each skill is a pure function. Toggles change the next compile.";
    case "review":
      return "Draft answers from compiled evidence, not from the raw dump.";
    case "profile":
      return "The curator note the article called a living profile.";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function phaseLabel(phase: CompilePhase): string {
  switch (phase) {
    case "extract":
      return "extract";
    case "link":
      return "link";
    case "categorize":
      return "categorize";
    case "detect-contradictions":
      return "contradictions";
    case "update-index":
      return "index";
    case "compile-brief":
      return "brief";
    case "canvas":
      return "canvas";
    case "profile":
      return "profile";
    case "bases":
      return "bases";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function today(): string {
  return "2026-11-09";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
