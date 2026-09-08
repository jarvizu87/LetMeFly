# LetMeFly Bar Loader UI Standard — LOCKED v1

Status: **LOCKED**

This document defines the approved Bar Loader behavior and presentation for LetMeFly. It is a UI/utility standard only. It must never mutate Crownforge, Black Crown, Crown Maintenance, or any future program prescription.

## Entry points

1. **More → Bar Loader** opens the standalone calculator.
2. Applicable barbell exercises expose **BAR LOAD** in the exercise actions.
3. Exercise launch pre-fills the active set's prescribed/logged load and detected unit when available.
4. Opening, calculating, copying, changing bar settings, or changing plate inventory never changes the programmed workout load.

## Smart exercise-name display rules

Canonical exercise names remain unchanged in program data, persistence, exercise intelligence, art/video matching, analytics, and history.

Short display names may be used only where space is constrained. Locked examples include:

- Incline DB Press → **Inc DB Press**
- Incline Dumbbell Press → **Inc DB Press**
- Incline Dumbbell Bench Press → **Inc DB Press**
- 1/2 Kneeling Chop → **Half-Kneeling Chop**
- Half-Kneeling Cable Chop → **Half-Kneeling Chop**

Approved common abbreviations include DB, KB, RDL, OHP, ISO, 1-Arm, 1-Leg, Rear Delt, and BB when necessary.

## Bar Loader control layout

The top of the utility contains:

- Target total
- Unit (lb / kg)
- Bar weight
- Collars total
- Quick bar presets
- Plate-set presets

### Locked bar presets

For pounds:

- **45 lb Power Bar**
- **35 lb Technique Bar**
- **Custom Bar**

For kilograms:

- **20 kg Men's Bar**
- **15 kg Women's Bar**
- **Custom Bar**

### Locked plate preset names

- **Iron Plates**
- **Bumper Plates**
- **Custom**

Presets populate plate-pair inventory but remain editable. Manual inventory changes return the inventory state to Custom.

## Result card

The result card must show, in order:

1. **TARGET** with the requested total load as the strongest number.
2. Status badge:
   - **EXACT** when the target can be built exactly.
   - **CLOSEST POSSIBLE** when it cannot.
3. For non-exact loads, show the achieved total and delta from target.
4. **EACH SIDE** with the exact plate sequence.
5. **COPY LOAD** action.
6. A symmetrical bar loading diagram.
7. Compact metadata for bar weight, collar weight, and active plate inventory preset.

Copy format for exact loads should be equivalent to:

`255 lb = 45 lb bar, each side: 55 + 25 + 25`

For a non-exact result, copied text must clearly distinguish target from achieved load.

## Bar diagram — locked geometry

This is a correctness rule, not decoration.

- The left and right plates must visibly sit on the sleeves.
- Both sides must mirror one another.
- The largest loaded plate is closest to the bar on both sides.
- On the left side, the rendered plate order is visually reversed so the same loading sequence mirrors correctly.
- There is no floating gap between a plate stack and its sleeve.
- Plate denominations use subtle relative height/width differences for easier scanning.
- Bar shaft, sleeve, and built-in inner stops are visually distinct.
- When collar weight is greater than zero, an outer collar indicator appears outside the plate stack on each side.
- The diagram must remain readable on 320–360 px phone widths.

Example for a 45 lb bar at 255 lb total:

- Each side: **55 + 25 + 25**
- Left visual: outside → 25 → 25 → 55 → sleeve → bar
- Right visual: bar → sleeve → 55 → 25 → 25 → outside

## Available Plates

- Available Plates is a collapsible section.
- The collapsed summary shows the current inventory state: Iron Plates, Bumper Plates, or Custom inventory.
- Inventory is expressed as available **plate pairs**.
- Users may edit the pair count for every supported denomination.
- Settings are saved on the current device.

## Solver behavior

- Calculate plate weight per side after subtracting bar and total collar weight.
- Respect the user's available plate-pair counts.
- Prefer an exact result when possible.
- If exact loading is unavailable, return the closest achievable total.
- When two combinations reach the same total, prefer fewer plates.
- Never silently change the user's target field to the nearest load.

## Units

Pounds support:

55, 45, 35, 25, 10, 5, 2.5, 1.25 lb plates.

Kilograms support:

25, 20, 15, 10, 5, 2.5, 1.25, 0.5 kg plates.

## Persistence and safety boundaries

The Bar Loader may save only its own device-local utility preferences such as:

- unit
- default bar
- collar weight
- plate inventory
- active plate preset

It must not write workout set completion, workout prescriptions, readiness data, athlete TMs, or program package data.

## Regression requirements

Every production build must verify:

- Inc DB Press smart-name mapping
- Half-Kneeling Chop smart-name mapping
- More-tab Bar Loader entry point
- contextual BAR LOAD entry point
- Iron Plates preset
- Bumper Plates preset
- named lb and kg bar presets
- COPY LOAD action
- EXACT and CLOSEST POSSIBLE states
- separate left/right plate rendering
- left-side mirrored plate order
- sleeve elements on both sides
- collar indicator support
- collapsible Available Plates inventory
- small-phone styling
- one valid production HTML document
- Workout Flow / Pyramid Flow / exercise-art runtime helpers remain present
