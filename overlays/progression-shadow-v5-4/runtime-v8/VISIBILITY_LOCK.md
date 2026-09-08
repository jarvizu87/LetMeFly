# Runtime v8 Visibility Lock

Visible progression is fail-closed.

A future progression surface may be authorized only when BOTH are true:
1. stored Shadow pilot status passes all current gates, including original-hook journal consistency and runtime-v8 provenance; and
2. a separate explicit operator/app enable flag is true.

A clean pilot by itself does not make progression visible.

The helper is read-only and does not persist the enable flag. Runtime v8 does not wire XP/Quest/Rank UI into the current V5.4 app.
