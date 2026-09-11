# Athlete bar and plate setup

Bar Loader and workout plate helpers share the active athlete's native
`athletePreferences.preferences.barbell` setup. This bridge only reads data;
it does not change workout loads, program prescriptions, training maxes, or
athlete preferences. Explicit device utility overrides remain on the device.

`barWeight` and `plates` use the setup's explicit unit, or the athlete's saved
weight unit. A list of plate denominations does not establish how many pairs
are available. With no saved quantities, the loader presents the saved bar
and sizes, asks for pair counts, and waits for **Use these plate counts** before
calculating. Inline helpers point to that same confirmation. Exact source
pair counts can also be supplied in `barbell.pairs`.

Older loader versions saved their full default inventory merely on closing.
Those unchanged defaults cannot count as confirmed equipment. Changed legacy
quantities remain an unconfirmed draft; an explicit new confirmation or plate
preset activates the device inventory. The other unit retains its independent
utility setup rather than relabeling pounds as kilograms.

Contract and phone/desktop browser audits cover old default auto-saves, count
confirmation, absent plate denominations, exact plate math, shared inline
settings, explicit device overrides, reload, and kilogram fallback.
