# Runtime v9 Immutable Evidence Contract

Finalized evidence and the separate human-review record are add-once. The first stored record for a program-run/workout key cannot be overwritten by a later QA attempt.

Stored pilot status reconstructs the review from `packet.machine` + `packet.human`. The cached `packet.review` is treated as a derived convenience object only. If it disagrees with the reconstructed review, the mismatch blocks pilot status and the cached values are ignored.

The human review timestamp must be valid and must be at or after the machine evidence capture timestamp.

This protects audit integrity only. It does not change XP economics, workout history, readiness, or programming.
