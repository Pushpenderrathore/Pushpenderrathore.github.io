# Pushpenderrathore.github.io — Agent Instructions

Personal portfolio site (GitHub Pages, served from `main`). Key pages: `index.html`,
`gsoc.html`, `prs.html`.

## Badge sync rules (MUST follow)

The PR status badges on `prs.html` and `gsoc.html` are kept in sync with GitHub PR
state (open / merged / closed). When syncing badges — whether by editing the static
HTML or via the client-side script in `prs.html` — you MUST honor the pinned overrides
in `data/pr_status_overrides.json`.

- Overrides are keyed by `"repo#number"` and win over the live GitHub state.
- They exist so an **open** PR that is actually **under active review** shows an
  `in review` badge instead of a plain `open` one.
- **Do not revert a pinned PR to its raw GitHub state.** Specifically,
  `rapid7/metasploit-framework#21608` is pinned to `review` ("In review") even though
  the GitHub API reports it as `open`. Leave it as "In review" until the override is
  removed from `data/pr_status_overrides.json`.

How the override is wired:

- `prs.html` — the inline script reads `STATUS_OVERRIDES` (mirrors the JSON file) and
  applies it in both the live-fetch render and the fallback. The `review` state uses the
  `.pr-badge--review` style and the `in review` label from `BADGE_LABELS`.
- `gsoc.html` — the resource card for a pinned PR carries a `<!-- badge-sync: ... -->`
  marker; keep the pinned label.

When a pinned PR actually merges or closes on GitHub, remove its entry from
`data/pr_status_overrides.json` (and the mirror in `prs.html` `STATUS_OVERRIDES`) so the
normal sync resumes.
