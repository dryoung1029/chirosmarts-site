---
name: voice-profile
description: Check a draft (article, script, teleprompter copy) against Dr. Jason Young's voice profile and flag places it drifts, or update the voice profile from new transcripts. Use when the user asks to review something "in my voice," check a script before recording, cut down on verbal tics like "so," or fold new transcripts/recordings into the voice profile.
---

# Voice profile — check a draft, or learn from new transcripts

Two profiles live in `profiles/`, for two different things people say out loud
vs. write:

- **`profiles/written-voice.md`** — collateral, articles, marketing copy. Clean
  written prose. Canonical/live copy is `src/config/voice-profile.md` in the
  chirosmarts-site repo (Collateral Studio reads that one directly) — if you're
  running inside that repo, **read the live file, not the bundled copy**, and
  flag it to the user if the two have drifted apart.
- **`profiles/spoken-voice.md`** — anything meant to be read aloud: a
  teleprompter script, recorded narration, a live talk. A distinct register
  from written collateral — long sentences that read fine on a page can be
  unspeakable off a prompter, and some spoken tics (a rhetorical question, a
  little hedge) are a feature there that would be a flaw in writing.

**Portability:** this whole `voice-profile/` folder is self-contained — profiles,
scripts, and this file. To use it in a project other than chirosmarts-site, copy
the folder into that project's `.claude/skills/`, or into `~/.claude/skills/` on
your own machine to make it available everywhere. Outside chirosmarts-site there
is no `src/config/voice-profile.md` to prefer — just use the bundled copy.

If it's not obvious which register the draft is (a script, an email, a blog
post, a talk outline), ask before picking a profile — the feedback is
different for each.

## Mode 1 — Check a draft against the profile

1. Identify the register (written vs. spoken/teleprompter) and load the right
   profile per the rule above.
2. Run the mechanical tic report on the draft:
   ```
   python3 .claude/skills/voice-profile/scripts/tic_report.py <draft-file>
   ```
   This gives deterministic counts — sentence length, hedge tics, and every
   sentence-initial "so" printed out individually so they're directly
   editable. It flags when "so" is running hotter than his natural rate from
   real unscripted talk (~1 per 150 words) — worth calling out explicitly,
   since that's the one tic he's asked to actively cut down on.
3. Read the draft against the profile's qualitative checks:
   - Does it open with a hook (scenario, stakes, question) or did a definition
     sneak in first?
   - Analogy before term, or term before analogy?
   - Second-person, direct address — or does it slip into describing content
     in the abstract?
   - For spoken drafts: does any sentence run long enough that reading it
     aloud would be a mouthful? Flag it by quoting it, don't just say "some
     sentences are long."
   - Any generic-AI-collateral tells the hard rules warn against (hype
     openers, invented anecdotes, a fact the source doesn't support)?
4. Report back as a concrete punch list — quote the actual line, name what's
   off, suggest a specific fix in his own devices (a real analogy, a
   rhetorical-question-then-answer, a shorter breath-group). Don't rewrite the
   whole draft unless asked; a punch list is more useful for something someone
   is about to record or publish themselves.

## Mode 2 — Update the profile from new transcripts

Triggered when the user hands over one or more new recordings/transcripts and
wants the profile refreshed.

1. Run the tic report over the new transcript(s) the same way, to get fresh,
   comparable numbers (e.g. "is he already saying 'so' less now that he's
   watching for it?").
2. Read the new material for patterns **not already captured** in the
   relevant profile — a new recurring analogy, a real anecdote, a phrase he
   reaches for more than once. One-off lines aren't worth adding; recurring or
   clearly distinctive ones are.
3. Propose a redline — additions and any corrections, clearly marked as a diff
   (`+`/`-` or a before/after), against the specific profile file(s) affected.
   **Never edit a profile file directly without showing the diff and getting a
   yes first** — these files are read by both a human (recording/writing) and,
   for the written one, an automated generation prompt, so a bad edit has
   real reach.
4. On confirmation: apply the accepted edits. If the written profile changed
   and you're inside chirosmarts-site, update **both**
   `src/config/voice-profile.md` (the live one) and
   `profiles/written-voice.md` (the bundled mirror) together, and say so
   explicitly — don't let them silently drift.

## Hard rules (apply regardless of mode)

- Never fabricate an anecdote, a clinical fact, or a regulatory claim to fill
  a gap — flag the gap instead, or leave an explicit slot for him to fill in.
- The tic-frequency numbers are a signal, not a verdict — a hedge word used
  once for real warmth is fine; the report exists to catch it running away,
  not to zero it out.
