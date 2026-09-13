# Held UI preview recovery

PR #91 remains a development preview. The user rejected the earlier preview's
visual match to the locked mockups. A successful build does not override that
decision, and this change does not authorize a production release.

This batch finishes the recovered presentation work:

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
