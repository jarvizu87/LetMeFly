# Runtime v8 Provenance Contract

The original completed-workout Shadow hook hashes the exact mapped prescription and outcome using stable recursive key ordering + SHA-256.

Stored first-hook receipt fields include:
- provenance schema version;
- runtime version;
- prescription SHA-256;
- outcome SHA-256;
- combined SHA-256.

Later pilot evidence re-hashes the current mapped workout. The stored-pilot evaluator blocks visibility if:
- the original immutable receipt has no provenance;
- the current evidence provenance does not match the immutable original receipt;
- a legacy pilot evidence packet does not use the runtime-v8 v2 evidence schema.

This detects post-completion mapping/data drift instead of silently reviewing a different workout state.

Provenance is evidence only. It never changes XP, readiness, program logic, workout history, or training prescriptions.
