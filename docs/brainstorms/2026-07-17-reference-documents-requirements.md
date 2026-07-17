---
date: 2026-07-17
topic: reference-documents
---

# Reference Documents — Requirements

## Summary

A per-book set of small, read-only reference PDFs (roll tables, playkit pages, expansion tables), summoned from a paper-stack icon in the bottom-right corner: tap it and the documents fan out over the book; pick one and the screen splits — gamebook left, reference document right, opened at the top. Dismiss it and the book returns to full screen.

---

## Problem Frame

Mid-scene in a solo session, the player needs a specific table they already know — the oracle, the event table — from the Playkit or an expansion. Today those pages are printed out and sit on the desk. The papers work, but they are exactly the digital clutter the app exists to absorb (the notebook stays analog; the reference stack shouldn't have to). The app is currently single-document: opening another PDF replaces the gamebook, so references have no home at all.

---

## Key Decisions

- **The unit of access is the document, kept viable by small documents.** Play-time need is "a specific table I already know," but the reference docs are only a few pages each, so opening a document at the top and scrolling briefly is fast enough. No bookmarks, last-page memory, or region-pinning inside reference docs.
- **Split reader, not a floating clip or full overlay.** Selecting a document splits the screen — book left, reference right — giving full page context while the book stays visible and usable. Floating table-cards and full-document overlays were considered and set aside.
- **Reference sets are tied to the open gamebook.** The Playkit belongs to Artefact; a future second game gets its own stack. Sets are keyed by the book's file path, matching how bookmarks are keyed.
- **The character sheet stays on paper.** It is written on, and writing stays analog. The app holds read-only references only.
- **In split view, the book's bookmark tabs move with the book pane** — they sit on the divider, keeping "right edge of the book = places in the book" unambiguous.

---

## Requirements

**Summoning**

- R1. A paper-stack icon sits in the bottom-right corner of the screen whenever a gamebook is open, styled like the existing low-opacity chrome.
- R2. Tapping the icon fans the book's reference documents out over the dimmed page; tapping outside the fan or pressing Escape dismisses it without opening anything.
- R3. If the book has no reference documents yet, the fan shows an add-documents affordance instead of an empty fan.

**Split view**

- R4. Selecting a document from the fan splits the screen: gamebook on the left, the reference document on the right, opened at its first page.
- R5. The reference pane is scrollable and renders fit-to-width; it carries no bookmarks and does not remember its last position between opens.
- R6. One reference document is open at a time; selecting another from the fan replaces the current one.
- R7. A close control on the reference pane returns the book to full screen; the book keeps its scroll position throughout the split and the close.
- R8. While split, all table tools (dice, coin, cards, tarot, audio) remain usable — consulting a table and rolling on it is the core moment this feature serves.
- R9. In split view, the book's bookmark tabs sit on the right edge of the book pane (the divider) and keep working.

**Managing the set**

- R10. Documents are added from the fan via a multi-select file picker and removable from the fan.
- R11. Each book's reference set persists across launches, keyed by the book's file path, in the same JSON-in-app-data pattern used for bookmarks.
- R12. If a reference file no longer exists on disk, the fan shows it as missing and offers removal; it never crashes or blocks the fan.

---

## Key Flows

- F1. Consulting a known table
  - **Trigger:** Player is reading the gamebook and needs the oracle table.
  - **Steps:** Tap the paper stack → fan appears → tap "Playkit" → screen splits with the Playkit open at the top → scroll a few pages to the table → roll dice from the chrome while both stay visible → close the pane.
  - **Outcome:** Book is back at full screen, at the same page it was on. **Covers R2, R4, R7, R8.**
- F2. First-time setup for a book
  - **Trigger:** Player opens the stack for a book with no reference set.
  - **Steps:** Tap the paper stack → add-documents affordance → pick the Playkit and expansion PDFs from disk → fan now shows them.
  - **Outcome:** The set persists; next launch of this book shows the same fan. **Covers R3, R10, R11.**

---

## Acceptance Examples

- AE1. **Covers R6.** Given the Playkit is open in the split pane, when the player opens the fan and selects the expansion, then the expansion replaces the Playkit in the pane — no second pane appears.
- AE2. **Covers R11.** Given Artefact has three reference documents, when the player opens a different gamebook, then the split view (if open) closes and the paper stack now fans out that book's own set — which may be empty.
- AE3. **Covers R12.** Given a reference PDF was deleted from disk, when the player opens the fan, then the entry appears marked missing with a remove option, and other documents still open normally.

---

## Scope Boundaries

- **Character sheets** — stay printed and handwritten; no fillable-PDF or annotation support.
- **Navigation aids inside reference docs** — no bookmarks, no last-page memory, no region pinning; small documents make them unnecessary.
- **Pinned region clips** — remains a separate future idea (DECISIONS.md); this feature neither replaces nor blocks it.
- **Custom rollable random tables** — a distinct future feature (plain-text tables rolled from the dice drawer), not part of PDF references.
- **Global document library** — no cross-book document pool or management screen; the set lives with the book.

---

## Dependencies / Assumptions

- The quick-access promise rests on reference documents staying small (a few pages each). If a large document joins the stack, "open at the top" stops being fast — revisit navigation aids then.
- The app renders all PDFs through a single warmed pdf.js worker with a queue that serializes document loads (`src/lib/pdfWorker.ts`); a second concurrently-open document must work within or extend that constraint — a planning-time concern, flagged here because it shapes feasibility.
- No session persistence of open documents exists today; the reference-set store is new but follows the proven bookmarks pattern (`src/lib/bookmarks.ts`).

---

## Sources

- `DECISIONS.md` — "Multiple reference PDFs are first-class"; semantic edges (right = places in books, bottom = tools); tools-over-the-page principle.
- `solo-rpg-companion/src/routes/+page.svelte` — single-document state and open-dialog flow this feature extends; one-tool-at-a-time chrome the stack icon sits beside.
- `solo-rpg-companion/src/lib/bookmarks.ts` — per-book-path JSON persistence pattern to reuse.
- `solo-rpg-companion/src/lib/BookmarkRail.svelte` — bookmark rail currently anchored to the viewport right edge; moves to the book pane in split view (R9).
