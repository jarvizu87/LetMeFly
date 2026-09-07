# LetMeFly Exercise Video Link Audit — 2026-09-07

## Scope

This audit covers the exercise-video records embedded in the current LetMeFly rebuild source that feeds the production Command V2 app.

Baseline embedded library reviewed: **82 canonical exercise records**.

## Baseline findings

- **27** records were marked `direct-source-library` and pointed at legacy Vimeo URLs.
- Those 27 records used **22 unique Vimeo URLs**.
- **55** records already used YouTube search-result fallbacks (`plan-linked-search` or `search-fallback`).
- Front Squat's legacy Vimeo page was directly confirmed unavailable during the Galaxy release test.
- Several legacy Vimeo URLs were reused across materially different exercise variants:
  - Clean-Grip RDL to Knee / Romanian Deadlift
  - Glute Bridge / Glute Bridge Isometric Hold
  - Lat Pulldown / Neutral-Grip Lat Pulldown / Wide-Grip Lat Pulldown
  - Push-Up / Scapular Push-Up
- Several YouTube-search links contained stale or ambiguous wording such as alternative exercises, provider prefixes, or literal `YouTube Search` text. That could return a demonstration for the wrong movement even though the URL itself remained reachable.

## Release remediation

For the Monday release, LetMeFly now applies these rules during the production build:

1. The Front Squat legacy Vimeo URL is replaced by the currently approved direct YouTube demonstration.
2. Every other legacy Vimeo `direct-source-library` record is **demoted to an honest YouTube search fallback** until a replacement direct instructional video is manually approved.
3. Every search fallback is normalized to the **exact canonical exercise name + `exercise tutorial`**. Alternate movement names are not mixed into one search query.
4. A build-time audit rejects:
   - any remaining Vimeo URL in the embedded exercise library,
   - a `direct-source-library` record that is not a direct YouTube video,
   - a search-status record that is not a YouTube search-results URL,
   - stale `YouTube Search` or `+or+` query wording.

## Status after remediation

The release policy is intentionally conservative: **a search fallback is preferable to a broken or misleading direct video**.

The app can therefore ship without knowingly presenting the legacy Vimeo catalog as vetted direct media. Direct links will be promoted one exercise at a time only after the instructional source is reviewed and approved.

This video-link work changes exercise intelligence only. It does **not** modify Crownforge prescriptions, loads, sets, reps, exercise selection, or progression logic.

## Follow-up

The long-term target remains a fully vetted direct-video library for all programmed exercises, using reputable instructional sources and editable links. The current search fallback layer is the safe production bridge while that curation continues.
