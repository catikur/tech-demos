/*
 * NoteKeeper — a tiny fictional CLI notes app, authored for the rea-lite demo.
 *
 * This file IS the demo's reverse-engineering target. Every address, string,
 * symbol, disassembly line and pseudo-C snippet in the seeded agent trace
 * (src/data/trace.ts) was hand-written to match this source, as if an agent
 * had analyzed a stripped build of it. No real binary is shipped or parsed.
 *
 * MIT-style: do whatever you want with this sample.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define NOTE_MAX 64
#define AUTOSAVE_DEBOUNCE_MS 800

typedef struct {
    char title[64];
    char body[1024];
    long created_ms;
} Note;

static Note g_notes[NOTE_MAX];
static int g_note_count = 0;

/* ---------------------------------------------------------------- autosave */

static long g_last_edit_ms = 0;
static int g_dirty = 0;

static long autosave_debounce_ms(void) {
    const char *env = getenv("NOTEKEEPER_AUTOSAVE_MS");
    if (env && *env) {
        long v = strtol(env, NULL, 10);
        if (v > 0) return v;
    }
    return AUTOSAVE_DEBOUNCE_MS;
}

void autosave_mark_dirty(long now_ms) {
    g_dirty = 1;
    g_last_edit_ms = now_ms;
}

static void note_flush(const Note *n) {
    char path[128];
    snprintf(path, sizeof path, "notes/%s.md", n->title);
    FILE *f = fopen(path, "w");
    if (!f) return;
    fputs(n->body, f);
    fclose(f);
    printf("autosave: flushed %s (%zu bytes)\n", path, strlen(n->body));
}

/* Called from the main loop every tick. Saves only once the user has been
 * idle for the debounce window — never mid-keystroke. */
void autosave_tick(long now_ms) {
    if (!g_dirty) return;
    if (now_ms - g_last_edit_ms < autosave_debounce_ms()) return;
    for (int i = 0; i < g_note_count; i++) note_flush(&g_notes[i]);
    g_dirty = 0;
}

/* ------------------------------------------------------------------ search */

/* Fuzzy subsequence score: every query char must appear in order in the
 * candidate. +2 per matched char, +3 extra when the match is consecutive,
 * +5 extra when it lands on a word start. Returns -1 on no match. */
int search_score(const char *query, const char *candidate) {
    int score = 0, prev = -2;
    const char *c = candidate;
    for (const char *q = query; *q; q++) {
        const char *hit = NULL;
        for (const char *p = c; *p; p++) {
            if (tolower(*p) == tolower(*q)) { hit = p; break; }
        }
        if (!hit) return -1;
        int pos = (int)(hit - candidate);
        score += 2;
        if (pos == prev + 1) score += 3;
        if (pos == 0 || candidate[pos - 1] == ' ') score += 5;
        prev = pos;
        c = hit + 1;
    }
    return score;
}

typedef struct { int index; int score; } Hit;

static int compare_hits(const void *a, const void *b) {
    return ((const Hit *)b)->score - ((const Hit *)a)->score;
}

int search_notes(const char *query, Hit *out) {
    int n = 0;
    for (int i = 0; i < g_note_count; i++) {
        int s = search_score(query, g_notes[i].title);
        if (s >= 0) { out[n].index = i; out[n].score = s; n++; }
    }
    qsort(out, n, sizeof(Hit), compare_hits);
    printf("search: %d hits for \"%s\"\n", n, query);
    return n;
}

/* ------------------------------------------------------------------ export */

#define NOTEKEEPER_VERSION "0.3.1"

/* Writes every note into one Markdown file, in creation order. */
int export_markdown(const char *path) {
    FILE *f = fopen(path, "w");
    if (!f) return -1;
    fprintf(f, "# NoteKeeper export v%s\n\n", NOTEKEEPER_VERSION);
    fprintf(f, "%d notes\n\n", g_note_count);
    for (int i = 0; i < g_note_count; i++) {
        fprintf(f, "## %s\n\n%s\n\n", g_notes[i].title, g_notes[i].body);
    }
    fclose(f);
    printf("exported %d notes to %s\n", g_note_count, path);
    return g_note_count;
}

/* -------------------------------------------------------------------- main */

int main(void) {
    puts("NoteKeeper " NOTEKEEPER_VERSION " — fictional sample for rea-lite");
    return 0;
}
