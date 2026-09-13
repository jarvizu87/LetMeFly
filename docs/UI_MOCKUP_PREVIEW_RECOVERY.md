# Held UI preview recovery

## Recording rejection — September 13

The user rejected both layouts in `1000028802.mp4`. Earlier passing geometry
checks do not establish visual acceptance. The Train recording shows native
`preview-card` nodes before workout start still receiving the old square art
rule from `mobile-recording-regression-v1.css`. The latest desktop reproduction
measured that empty image region at 678 × 678 px and the first warm-up card at
941 px tall. The previous correction covered live `active-exercise` cards only.

The follow-up uses the native preview cards and prescriptions with one expanded
movement, compact movement selectors, the same block pager, and proportional
art in the heading region. It does not create live inputs or set-writing actions
in previews. Live inputs remain native; their padding/height is tightened and
the desktop Log Set button shares the input row. The optional Netlify Drawer,
which is blocked by this app's CSP and covered the phone navigation, is hidden
without relaxing that policy.

Regression checks now cover before-start and future-day cards, preserve every
native prescription through movement selection, and reject the obsolete square
panel. The older smoke test's square-image requirement is superseded by Train
Card Standard v2. Reports explicitly separate container geometry from successful
private picture delivery. Signed-in picture loading and final visual acceptance
remain open; the video shows placeholders. No production release is authorized
by this correction.

Billing verification: the four recent card/logo deployments ending at c689a8f
are Netlify `deploy-preview` context, with no production `published_at` value.
The production deployment remains 6aa48a7f3c5fea0008502f12, published September 11
at 23:12 UTC. Netlify lists Deploy Previews at zero deployment credits; traffic
is metered separately. Exact account traffic charges were not available through
the connected read-only tools.

PR #91 remains a development preview. The user rejected the earlier preview's
visual match to the locked mockups. A successful build does not override that
decision, and this change does not authorize a production release.

This batch finishes the recovered presentation work:

- Home's continuous red mountain hero, inset workout card and single start action,
  two-by-two intelligence grid, four readiness metrics, and saved performance.
- Train's readiness-first banner, original section navigation, compact set history,
  governed exercise art, native logging inputs, load helper, and manual rest timer.
- Program overview, real selected week/day cards, and access to the complete
  original program catalog through the workspace tabs.
- Progress artwork, six summary cards, analytics grid, and saved-history metrics.
- Exercises artwork, category navigation, and a desktop detail panel that forwards
  Watch, Info, and Substitute to the original controls.
- Coach artwork, question composer, conversation, and reference/context columns.
- Profile character sheet, saved training maxes, goals, and existing editing and
  backup actions.
- More artwork and tool icons, shared navigation, and readable phone controls.

The public scene wrappers contain only the extracted artwork viewports. They do
not embed complete mockup screenshots with offscreen sample athlete information.
The scene manifest retains the approved reference hashes for provenance and
separate hashes/dimensions for the delivered artwork. The scene validator checks
the actual delivered raster, rather than only the outer SVG dimensions.

Workout persistence, governed program prescriptions, progression, private athlete
records, and the Netlify production gate remain owned by the existing systems.
The late Progress stylesheet retains `overflow-y: auto !important`.

Required verification: static scene and installer checks; Command V2's browser
audits (including Progress scroll and locked UI); five-athlete release gate;
existing full-app/lifecycle gates; Netlify policy; direct visual comparison with
the approved references. Production remains held pending visual acceptance.

The follow-up audit also corrected shared active-navigation accents to red,
kept duplicate Progress editors behind the existing training-data disclosure,
restored that disclosure after late history renders, and gave Training Experience
a full-width row in the phone Profile character sheet. Home's completed-workout
summary excludes unfinished, deleted, foreign-athlete, distance, and time records
and converts weight units before aggregating. Reviewing sets and operating rest
controls cannot create strength estimates; the native Log Set action retains
that responsibility.

Train control focus and clicks keep the working section centered. Revealing a
low set or rest control must not move the horizontal carousel into another
workout block. The original section buttons, arrows, and native scroll listener
continue to own section navigation. The native listener now distinguishes an
intentional horizontal wheel, touch, scrollbar, or keyboard gesture from automatic
control-reveal scrolling; the latter cannot change the selected block.

The follow-up Train block correction uses the saved close-up mockup: one bordered
block with a numbered heading, the original exercise picture blended behind the
title, a rest timer at upper right, a side-by-side set table and loading panel,
coaching guidance, and compact native logging controls. Collapsed sections retain
their real section number and summary. Compact movements within a circuit remain
part of that circuit; presentation never splits them into new programmed blocks.

The existing picture resolver remains authoritative. The final stylesheet uses
masks and gradients only and contains no replacement image URL. Plate illustrations
mirror the existing Bar Loader's per-side labels. Block arrows forward to native
exercise selection and are disabled during the native between-round rest gate.
Circuit ordering, unequal set counts, movement dropout, readiness, prescriptions,
load/reps/RPE logging, recovery, substitutions, preview-day protections and
completion continue through the existing workout owners and release checks.

The official logo now displays at 52px in the shared phone header and 64px in
Home's phone header and the desktop header. Home references the original PNG
directly, avoiding an older external-image SVG wrapper. The native first-run form
uses 104px. Initial app HTML shows the same
approved image at 160–192px while startup is pending; the normal native render
replaces it without a delay or a new dismissal action. Operating-system launch
screens before the app HTML loads remain controlled by the phone/browser.

The 2026-09-13 image inventory audit found all 228 active approved mappings and
all 164 referenced private files present. All 164 recovered source images decode,
meet the 640px minimum on both axes (actual minimum: 1254px), and match current
Storage filenames by SHA-256, byte counts, and object ETags by MD5. This validates
source integrity and the stored inventory, not a new authenticated browser download.

The current rendered library has 156 entries: 152 mapped exercises, one unmapped
exercise (Seated Band Hip Abduction), and three intentional non-exercise entries
(Full Rest, Black Crown Entry TM Rules, Verified Crownforge Results). The previous
147-governed-exercise coverage count does not cover every additional library entry.
Seated Band Hip Abduction needs its own reviewed image; a machine image cannot
silently stand in for a band exercise. Existing approved private images were not
replaced or reuploaded. Fresh owner-authenticated Train/library image delivery is
still a separate acceptance check; disposable preview fallback tiles do not pass it.
