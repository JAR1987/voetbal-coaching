# Coding Standards

`/code-review`'s Standards axis reads this file. Everything here is a real rule, not a
preference — where it disagrees with a general-purpose heuristic, this file wins.

## Comments

A comment must answer a question the reader cannot answer from the code next to it.

**Delete test.** If deleting the comment loses nothing a reader needs, delete it. Apply it to
your own comments before every commit.

Comment volume is a cost paid by every later reader, human or agent. A 78-line header is not
evidence of care; it is context every subsequent session must load before it can start work.

### Budgets

Enforced by `npm run check:comments`, wired into `check:generated`:

| Scope | Budget |
|---|---|
| File header (all comments before the first line of code) | 10 lines |
| Any single comment below the header | 3 lines |
| Whole file: comment lines ÷ non-blank lines | 25% |

The gate is a **ratchet** — it checks staged files, or the working tree's diff against
`master`. Files that predate it stay as they are until something touches them. Run
`npm run check:comments -- --list` for the whole-repo picture.

Over budget means the content belongs somewhere else, not that it needs shortening.

Two rules not mechanically gated, but reviewed:

- Prose inside a **generated artifact** (a `.sql` header, a generated `.json` banner): 6 lines.
  Generator path, "do not hand-edit", rebuild command. Nothing else.
- A file header states **what the file produces and how to run it**. Not why the ticket
  chose it.

### Where non-code content goes

| Content | Home | Not |
|---|---|---|
| Why the ticket was solved this way | bead notes — `bd update <id> --append-notes` | file header |
| A rejected alternative and its reasoning | bead notes; `docs/adr/` if it binds future work | file header |
| A known gap or accepted limitation | a bead, cited from one `// see fit-xxx` line | a paragraph |
| A measurement that justified a choice | bead notes — and assert it in code if the code depends on it | header prose |
| A constraint a future edit would silently break | an inline comment — this is what comments are for | anywhere else |

### Not in source files

- **Bead ids as narrative.** `// see fit-9aa.2` is fine. "the drift gate HARD 3 of
  `bd show fit-9aa.2`'s review asked for" is the bead's story, not the file's.
- **Review defense.** "flagged here, not fixed here", "rather than trusted", "so nothing here
  is invented", "this is a real discrepancy to report, not to paper over". The reviewer reads
  the bead; write the justification there.
- **Restating a doc.** Cite it — `// docs/reference/testing.md §16` — do not summarise it.
- **`Exported for test/unit`.** Either a test imports the symbol or the export is dead. The
  test is the evidence; the comment is not.
- **A claim the code does not enforce.** If a header promises a guarantee, assert it. A
  comment that says "this would fail loudly if X" beside code that never checks X is worse
  than no comment: it is read as a guarantee and relied on.

### Good comments

Keep these. They pay for themselves:

- A non-obvious constraint with its derivation — geometry, protocol, precision, ordering.
- Why an obvious simpler form is wrong here.
- A pointer to the one external fact the code cannot state itself (`RFC 4122 §4.3`, a
  vendored format's quirk, a schema line number).
