# LetMeFly V5.4 Progression Shadow Runtime v6 Overlay

Runtime v6 adds a private pilot journal so the controlled Shadow pilot can prove that the original workout-completion progression hook actually ran.

It adds:
- private IndexedDB pilot journal `letmefly.progression.shadow.pilot.v1`;
- immutable add-once original completion-hook receipts;
- original-hook receipt/processing requirements in the visible-pilot gate;
- optional persistence of independent human reviews;
- optional persistence of finalized pilot evidence packets;
- fail-open behavior when pilot-journal IndexedDB is unavailable.

A later QA replay cannot overwrite the original hook receipt.

Visible progression remains disabled and training remains authoritative.
