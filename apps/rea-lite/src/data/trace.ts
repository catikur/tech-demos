// Seeded agent trace for the rea-lite workbench.
//
// Every address, string, asm line and pseudo-C snippet below is hand-authored
// to match sample/notekeeper.c — the tiny fictional notes app this repo ships
// as its only reverse-engineering target. Nothing here comes from a real
// Ghidra/Hopper/IDA run; the data model just mirrors what REA-style tools
// would hand back to an agent.

export type Phase = "behavior" | "strings" | "disasm";

export type StringRow = { address: string; section: string; value: string };
export type SymbolRow = { address: string; kind: "func" | "data"; name: string };
export type AsmLine = { address: string; bytes: string; text: string; note?: string };

export type TraceStep = {
  id: string;
  phase: Phase;
  title: string;
  /** Mock tool id, styled after REA's MCP tool catalog. */
  tool: string;
  /** Simulated tool latency the server sleeps for before emitting the step. */
  durationMs: number;
  summary: string;
  observations?: string[];
  strings?: StringRow[];
  symbols?: SymbolRow[];
  focus?: string;
  asm?: AsmLine[];
  pseudoC?: string;
};

export type Evidence = { stepId: string; address?: string; quote: string };
export type Claim = { text: string; evidence: Evidence[] };
export type Report = {
  title: string;
  summary: string;
  claims: Claim[];
  limitations: string[];
};

export type Feature = {
  id: string;
  name: string;
  question: string;
  blurb: string;
  steps: TraceStep[];
  report: Report;
};

export const TARGET = {
  name: "NoteKeeper 0.3.1",
  kind: "sample native binary (x86-64 ELF, fictional)",
  source: "sample/notekeeper.c",
  note:
    "Authored for this demo. The trace below pretends to analyze a build of " +
    "this file — no third-party software is ever targeted.",
};

export const FEATURES: Feature[] = [
  {
    id: "autosave",
    name: "Autosave",
    question: "How does autosave know when to save?",
    blurb: "Notes save on their own shortly after you stop typing — but never mid-keystroke.",
    steps: [
      {
        id: "autosave-behavior",
        phase: "behavior",
        title: "Observe autosave behavior",
        tool: "observe.app",
        durationMs: 1300,
        summary:
          "Ran the sample build and watched the filesystem while editing a note. Writes only ever land after an idle pause.",
        observations: [
          "Opened note “groceries”; typed 14 chars over 3.2 s — zero file writes observed while typing.",
          "Stopped typing: notes/groceries.md mtime changed ≈0.81 s after the last keystroke.",
          "stdout: autosave: flushed notes/groceries.md (142 bytes)",
          "Re-ran with NOTEKEEPER_AUTOSAVE_MS=200 — the write landed ≈0.2 s after idle instead.",
          "Edited two notes back-to-back; both files flushed in the same burst.",
        ],
      },
      {
        id: "autosave-strings",
        phase: "strings",
        title: "Scan strings & symbols",
        tool: "binary.strings · binary.symbols",
        durationMs: 1700,
        summary:
          "The flush log line and an env-var name sit in .rodata; .symtab names a tick/dirty pair around two globals.",
        strings: [
          { address: "0x00492010", section: ".rodata", value: "NOTEKEEPER_AUTOSAVE_MS" },
          { address: "0x00492028", section: ".rodata", value: "notes/%s.md" },
          { address: "0x00492038", section: ".rodata", value: "autosave: flushed %s (%zu bytes)\\n" },
        ],
        symbols: [
          { address: "0x004015c0", kind: "func", name: "autosave_debounce_ms" },
          { address: "0x00401620", kind: "func", name: "autosave_mark_dirty" },
          { address: "0x00401650", kind: "func", name: "note_flush" },
          { address: "0x00401700", kind: "func", name: "autosave_tick" },
          { address: "0x004a4008", kind: "data", name: "g_dirty" },
          { address: "0x004a4010", kind: "data", name: "g_last_edit_ms" },
        ],
      },
      {
        id: "autosave-disasm",
        phase: "disasm",
        title: "Disassemble autosave_tick",
        tool: "decompiler.pseudo_c (mock)",
        durationMs: 2300,
        summary:
          "autosave_tick bails unless g_dirty is set AND now − g_last_edit_ms clears the debounce window; the default window is the immediate 0x320 (= 800).",
        focus: "autosave_tick @ 0x00401700",
        asm: [
          { address: "0x00401700", bytes: "83 3d 02 29 0a 00 00", text: "cmp dword ptr [rip+0xa2902], 0", note: "g_dirty" },
          { address: "0x00401707", bytes: "74 3a", text: "je 0x401743", note: "not dirty → return" },
          { address: "0x00401709", bytes: "48 8b 05 00 29 0a 00", text: "mov rax, qword ptr [rip+0xa2900]", note: "g_last_edit_ms" },
          { address: "0x00401710", bytes: "48 89 fb", text: "mov rbx, rdi", note: "now_ms arg" },
          { address: "0x00401713", bytes: "48 29 c3", text: "sub rbx, rax", note: "idle time" },
          { address: "0x00401716", bytes: "e8 a5 fe ff ff", text: "call 0x4015c0", note: "autosave_debounce_ms" },
          { address: "0x0040171b", bytes: "48 39 c3", text: "cmp rbx, rax", note: "idle < window?" },
          { address: "0x0040171e", bytes: "7c 23", text: "jl 0x401743", note: "still typing → return" },
          { address: "0x00401720", bytes: "e8 2b ff ff ff", text: "call 0x401650", note: "note_flush (loop)" },
          { address: "0x00401738", bytes: "c7 05 c6 28 0a 00 00…", text: "mov dword ptr [rip+0xa28c6], 0", note: "g_dirty = 0" },
        ],
        pseudoC: `/* decompiled: autosave_tick @ 0x00401700 */
void autosave_tick(long now_ms)
{
  if (g_dirty == 0) return;
  if (now_ms - g_last_edit_ms < autosave_debounce_ms())
    return;                        /* still typing */
  for (int i = 0; i < g_note_count; i++)
    note_flush(&g_notes[i]);       /* flush EVERY note */
  g_dirty = 0;
}

/* decompiled: autosave_debounce_ms @ 0x004015c0 */
long autosave_debounce_ms(void)
{
  char *env = getenv("NOTEKEEPER_AUTOSAVE_MS");
  if (env && *env) {
    long v = strtol(env, 0, 10);
    if (v > 0) return v;
  }
  return 0x320;                    /* 800 ms default */
}`,
      },
    ],
    report: {
      title: "How autosave works",
      summary:
        "Autosave is a debounce, not a timer: every edit stamps g_last_edit_ms and sets g_dirty; a main-loop tick flushes all notes only once the user has been idle for the whole window (default 800 ms, env-overridable).",
      claims: [
        {
          text: "Saves are debounced on idle time — autosave_tick returns early while (now − g_last_edit_ms) is below the window, which is why no write ever lands mid-typing.",
          evidence: [
            { stepId: "autosave-disasm", address: "0x0040171e", quote: "jl 0x401743 — still typing → return" },
            { stepId: "autosave-behavior", quote: "zero file writes observed while typing" },
          ],
        },
        {
          text: "The default window is 800 ms, hardcoded as the immediate 0x320 in autosave_debounce_ms — matching the ≈0.81 s delay observed after the last keystroke.",
          evidence: [
            { stepId: "autosave-disasm", quote: "return 0x320; /* 800 ms default */" },
            { stepId: "autosave-behavior", quote: "mtime changed ≈0.81 s after the last keystroke" },
          ],
        },
        {
          text: "The window can be overridden via the NOTEKEEPER_AUTOSAVE_MS environment variable (getenv + strtol, accepted only when > 0).",
          evidence: [
            { stepId: "autosave-strings", address: "0x00492010", quote: "NOTEKEEPER_AUTOSAVE_MS in .rodata" },
            { stepId: "autosave-behavior", quote: "NOTEKEEPER_AUTOSAVE_MS=200 — the write landed ≈0.2 s after idle" },
          ],
        },
        {
          text: "A flush writes every note, not just the edited one: the save loop iterates g_note_count and calls note_flush per note, then clears g_dirty.",
          evidence: [
            { stepId: "autosave-disasm", address: "0x00401720", quote: "call 0x401650 — note_flush (loop)" },
            { stepId: "autosave-behavior", quote: "both files flushed in the same burst" },
          ],
        },
      ],
      limitations: [
        "Timer resolution of the main-loop tick was not measured; the ±10 ms skew in observations is unexplained.",
        "note_flush error handling (fopen failure) was not traced.",
      ],
    },
  },
  {
    id: "search",
    name: "Fuzzy search",
    question: "How does search rank results?",
    blurb: "Typing a few letters finds notes whose titles merely contain them in order — and the ranking feels deliberate.",
    steps: [
      {
        id: "search-behavior",
        phase: "behavior",
        title: "Probe search ranking",
        tool: "observe.app",
        durationMs: 1300,
        summary:
          "Seeded three notes and compared queries. Matching is subsequence-based and the order is stable and repeatable.",
        observations: [
          "Notes: “grocery list”, “general ledger”, “garden log”.",
          "Query “grl” → stdout: search: 3 hits for \"grl\" — “grocery list” ranked first.",
          "Query “xq” → 0 hits: every query char must appear, in order.",
          "Query “gro” scores higher than “grl” on “grocery list” — consecutive runs look rewarded.",
          "Query “list” beats mid-word matches — word starts look rewarded too.",
        ],
      },
      {
        id: "search-strings",
        phase: "strings",
        title: "Scan strings & symbols",
        tool: "binary.strings · binary.symbols",
        durationMs: 1600,
        summary:
          "One search log format string; .symtab pairs a scorer with a qsort comparator — a classic score-then-sort shape.",
        strings: [
          { address: "0x00492060", section: ".rodata", value: "search: %d hits for \\\"%s\\\"\\n" },
        ],
        symbols: [
          { address: "0x00401790", kind: "func", name: "search_score" },
          { address: "0x00401880", kind: "func", name: "compare_hits" },
          { address: "0x004018a0", kind: "func", name: "search_notes" },
          { address: "0x004a4020", kind: "data", name: "g_note_count" },
          { address: "0x004a4040", kind: "data", name: "g_notes" },
        ],
      },
      {
        id: "search-disasm",
        phase: "disasm",
        title: "Disassemble search_score",
        tool: "decompiler.pseudo_c (mock)",
        durationMs: 2300,
        summary:
          "The scorer walks the query as a case-insensitive subsequence over the title, adding immediates +2 / +3 / +5; any missing char returns −1.",
        focus: "search_score @ 0x00401790",
        asm: [
          { address: "0x004017e8", bytes: "e8 13 fa ff ff", text: "call tolower", note: "case-insensitive compare" },
          { address: "0x004017f0", bytes: "83 c5 02", text: "add ebp, 2", note: "+2 per matched char" },
          { address: "0x004017f3", bytes: "8d 50 01", text: "lea edx, [rax+1]", note: "prev_pos + 1" },
          { address: "0x004017f6", bytes: "39 d1", text: "cmp ecx, edx", note: "consecutive?" },
          { address: "0x004017f8", bytes: "75 03", text: "jne 0x4017fd" },
          { address: "0x004017fa", bytes: "83 c5 03", text: "add ebp, 3", note: "+3 consecutive bonus" },
          { address: "0x00401801", bytes: "80 7c 0f ff 20", text: "cmp byte ptr [rdi+rcx-1], 0x20", note: "char before match == ' '?" },
          { address: "0x00401806", bytes: "83 c5 05", text: "add ebp, 5", note: "+5 word-start bonus" },
          { address: "0x00401830", bytes: "b8 ff ff ff ff", text: "mov eax, 0xffffffff", note: "no match → −1" },
        ],
        pseudoC: `/* decompiled: search_score @ 0x00401790 */
int search_score(char *query, char *candidate)
{
  int score = 0, prev = -2;
  char *c = candidate;
  for (char *q = query; *q; q++) {
    char *hit = find_ci(c, *q);     /* tolower on both sides */
    if (!hit) return -1;            /* subsequence or nothing */
    int pos = hit - candidate;
    score += 2;                     /* base: matched char */
    if (pos == prev + 1) score += 3;        /* consecutive run */
    if (pos == 0 || candidate[pos-1] == ' ')
      score += 5;                   /* word start */
    prev = pos; c = hit + 1;
  }
  return score;
}

/* decompiled: search_notes @ 0x004018a0 */
int search_notes(char *query, Hit *out)
{
  int n = 0;
  for (int i = 0; i < g_note_count; i++) {
    int s = search_score(query, g_notes[i].title);
    if (s >= 0) out[n++] = (Hit){ i, s };
  }
  qsort(out, n, 8, compare_hits);   /* descending by score */
  return n;
}`,
      },
    ],
    report: {
      title: "How search ranking works",
      summary:
        "Search is a fuzzy subsequence scorer plus a qsort: every query char must appear in order (case-insensitive) in a note title; matches earn +2 each, +3 when consecutive, +5 on a word start, and hits are sorted by score descending.",
      claims: [
        {
          text: "Matching is subsequence-or-nothing: the first query char with no remaining occurrence makes search_score return −1, so the note is dropped — explaining the 0 hits for “xq”.",
          evidence: [
            { stepId: "search-disasm", address: "0x00401830", quote: "mov eax, 0xffffffff — no match → −1" },
            { stepId: "search-behavior", quote: "Query “xq” → 0 hits" },
          ],
        },
        {
          text: "Consecutive characters earn a +3 bonus on top of the +2 base, which is why the tight run “gro” outscores the spread-out “grl” on the same title.",
          evidence: [
            { stepId: "search-disasm", address: "0x004017fa", quote: "add ebp, 3 — +3 consecutive bonus" },
            { stepId: "search-behavior", quote: "“gro” scores higher than “grl” on “grocery list”" },
          ],
        },
        {
          text: "Matches that land on a word start (offset 0 or right after a space) earn +5 — the biggest single bonus in the scorer.",
          evidence: [
            { stepId: "search-disasm", address: "0x00401806", quote: "add ebp, 5 — +5 word-start bonus" },
            { stepId: "search-behavior", quote: "Query “list” beats mid-word matches" },
          ],
        },
        {
          text: "Ranking is just qsort over (index, score) pairs with a descending comparator; there is no tie-break beyond qsort order.",
          evidence: [
            { stepId: "search-strings", address: "0x00401880", quote: "compare_hits next to search_notes in .symtab" },
            { stepId: "search-disasm", quote: "qsort(out, n, 8, compare_hits)" },
          ],
        },
      ],
      limitations: [
        "Scoring of repeated query characters was not exhaustively probed.",
        "compare_hits stability on equal scores is unverified (qsort gives no guarantee).",
      ],
    },
  },
  {
    id: "export",
    name: "Markdown export",
    question: "How does export produce its file?",
    blurb: "One command turns the whole notebook into a single Markdown file with a versioned header.",
    steps: [
      {
        id: "export-behavior",
        phase: "behavior",
        title: "Observe an export run",
        tool: "observe.app",
        durationMs: 1200,
        summary:
          "Triggered an export and diffed the output. One file, one pass, creation order, versioned header.",
        observations: [
          "Ran export → export/all-notes.md appeared in one write burst.",
          "File starts: “# NoteKeeper export v0.3.1”, then “3 notes”.",
          "Notes appear in creation order — not alphabetical, not last-edited.",
          "Each note renders as “## <title>” followed by its body.",
          "stdout: exported 3 notes to export/all-notes.md",
        ],
      },
      {
        id: "export-strings",
        phase: "strings",
        title: "Scan strings & symbols",
        tool: "binary.strings · binary.symbols",
        durationMs: 1500,
        summary:
          "The header, per-note and log format strings sit adjacent in .rodata next to the version literal; one exporter symbol.",
        strings: [
          { address: "0x00492080", section: ".rodata", value: "# NoteKeeper export v%s\\n\\n" },
          { address: "0x004920a0", section: ".rodata", value: "%d notes\\n\\n" },
          { address: "0x004920b0", section: ".rodata", value: "## %s\\n\\n%s\\n\\n" },
          { address: "0x004920c0", section: ".rodata", value: "exported %d notes to %s\\n" },
          { address: "0x004920e0", section: ".rodata", value: "0.3.1" },
        ],
        symbols: [
          { address: "0x00401960", kind: "func", name: "export_markdown" },
          { address: "0x004a4020", kind: "data", name: "g_note_count" },
          { address: "0x004a4040", kind: "data", name: "g_notes" },
        ],
      },
      {
        id: "export-disasm",
        phase: "disasm",
        title: "Disassemble export_markdown",
        tool: "decompiler.pseudo_c (mock)",
        durationMs: 2200,
        summary:
          "export_markdown is a straight-line fopen(\"w\") → header fprintf → per-note fprintf loop → fclose; the version in the header is the compiled-in literal.",
        focus: "export_markdown @ 0x00401960",
        asm: [
          { address: "0x00401965", bytes: "e8 c6 f6 ff ff", text: "call fopen", note: "mode \"w\" — truncate" },
          { address: "0x00401975", bytes: "ba e0 20 49 00", text: "mov edx, 0x4920e0", note: "\"0.3.1\"" },
          { address: "0x0040197a", bytes: "be 80 20 49 00", text: "mov esi, 0x492080", note: "header format" },
          { address: "0x00401984", bytes: "e8 87 f6 ff ff", text: "call fprintf", note: "versioned header" },
          { address: "0x004019a0", bytes: "be b0 20 49 00", text: "mov esi, 0x4920b0", note: "\"## %s\\n\\n%s\\n\\n\"" },
          { address: "0x004019b2", bytes: "e8 59 f6 ff ff", text: "call fprintf", note: "per-note, loop i++" },
          { address: "0x004019c4", bytes: "48 83 c3 40", text: "add rbx, 0x440", note: "sizeof(Note) stride" },
          { address: "0x004019d6", bytes: "e8 15 f6 ff ff", text: "call fclose" },
        ],
        pseudoC: `/* decompiled: export_markdown @ 0x00401960 */
int export_markdown(char *path)
{
  FILE *f = fopen(path, "w");       /* truncate, single pass */
  if (!f) return -1;
  fprintf(f, "# NoteKeeper export v%s\\n\\n", "0.3.1");
  fprintf(f, "%d notes\\n\\n", g_note_count);
  for (int i = 0; i < g_note_count; i++)
    fprintf(f, "## %s\\n\\n%s\\n\\n",
            g_notes[i].title, g_notes[i].body);
  fclose(f);
  printf("exported %d notes to %s\\n", g_note_count, path);
  return g_note_count;
}`,
      },
    ],
    report: {
      title: "How Markdown export works",
      summary:
        "Export is a single-pass serializer: fopen(path, \"w\") truncates the target, a versioned header is printed from compiled-in format strings, then one fprintf per note walks g_notes in array (creation) order before fclose.",
      claims: [
        {
          text: "The version in the header is a compiled-in literal (“0.3.1” in .rodata), not read from any config — the header can only change with a rebuild.",
          evidence: [
            { stepId: "export-strings", address: "0x004920e0", quote: "\"0.3.1\" adjacent to the header format" },
            { stepId: "export-disasm", address: "0x00401975", quote: "mov edx, 0x4920e0 — \"0.3.1\"" },
          ],
        },
        {
          text: "Notes are emitted in g_notes array order — the loop strides sizeof(Note) from index 0 — which is creation order, matching the observed file.",
          evidence: [
            { stepId: "export-disasm", address: "0x004019c4", quote: "add rbx, 0x440 — sizeof(Note) stride" },
            { stepId: "export-behavior", quote: "Notes appear in creation order" },
          ],
        },
        {
          text: "The output file is truncated up front (fopen mode \"w\") and written in one pass — there is no append or merge path, explaining the single write burst.",
          evidence: [
            { stepId: "export-disasm", address: "0x00401965", quote: "call fopen — mode \"w\" — truncate" },
            { stepId: "export-behavior", quote: "appeared in one write burst" },
          ],
        },
        {
          text: "Every piece of output text comes from four adjacent .rodata format strings; there is no templating layer.",
          evidence: [
            { stepId: "export-strings", address: "0x00492080", quote: "header/per-note/log formats adjacent in .rodata" },
          ],
        },
      ],
      limitations: [
        "Behavior when fopen fails (read-only dir) was observed to return −1 but the caller's handling was not traced.",
        "Non-ASCII titles were not exercised.",
      ],
    },
  },
];

export function getFeature(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}
