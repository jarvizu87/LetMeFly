# Workout Persistence Regression Status

Current phase: source-level diagnosis + recording-driven mobile scroll correction.

The user-provided workout recording showed Session Review stuck at `5 / 48` sets logged even though more work had been entered/completed, while the workout UI also reported sets as saved locally. This branch exposes the authoritative persistence and completion-count source from the reconstructed production build and runs a real-browser IndexedDB/review regression before any persistence change is accepted.

A second short recording independently shows the mobile workout section carousel fighting vertical day scrolling: the athlete can briefly reach lower exercise cards, then the horizontally snapping section viewport pulls the view back toward the active section/card; near the end the page visibly shifts sideways between section content. A mobile-only scroll guard now reserves direct page gestures for vertical day scrolling while retaining section tabs/arrows and exercise set-tab horizontal scrolling.
