# LetMeFly Approved Primary Tab Redesigns v1

This document locks the implementation contract for the remaining approved primary-tab mockups on PR #90. It supplements the Home/Coach cinematic standard, Train exercise-card standard, Exercise Image Treatment Standard v1, and LetMeFly UI Consistency Standard v1.

## Scope

The complete approved UI family is Home, Train, Program, Progress, Exercises, Coach, Profile, and More. This v1 layer completes the Program, Progress, Exercises, and Profile presentation so every primary tab is represented in the same pull request.

The redesign is presentation/navigation only. Program definitions, progression rules, workout prescriptions, training history, training maxes, readiness, private athlete data, exercise-intelligence records, substitutions, and persistence remain owned by their existing systems.

## Program

Program is a week command center rather than a generic list. It keeps the real current program and verified week/day data, then adds the approved Overview / Weeks / Exercises / Progression / Notes workspace navigation, cinematic program surface, phase/roadmap treatment, sticky week controls, and responsive week cards. The visual layer never invents a current phase, week, day, set, rep, or loading prescription.

## Progress

Progress uses the approved analytics-command-center language on desktop and mobile. Existing live metrics, charts, bodyweight, strength, conditioning, consistency, milestones, and PR data remain the source of truth. The redesign supplies the LetMeFly identity/world surface, purple tab/action language, stronger metric hierarchy, and consistent responsive cards without rewriting history.

## Exercises

Exercises uses the approved identity hero plus practical library workspace. Existing governed exercise images are preserved exactly. Desktop gets a category rail wired to the existing filter controls; mobile collapses back to the existing fast search/filter flow. Exercise cards, Watch, Info, Substitute, and Exercise Intelligence behavior remain owned by the existing library. No alternate exercise-art source is introduced.

## Profile

Profile uses the approved RPG/character-sheet composition on both desktop and mobile. It contains no profile photo/avatar. The identity side is a large integrated LetMeFly/Raizen-Fenrir world-art area, while the athlete data side reuses the existing private profile, current program, strength data, completion status, and actions.

The main sheet includes a Goal Tracker derived from the existing Primary Goal, Strength Goals, and Development Priorities fields. The detailed Equipment and Preferences fields remain available lower in the editable profile because they are still valuable coaching context; they are simply not the main character-sheet summary. Editing the existing fields updates the Goal Tracker presentation but the redesign layer itself does not persist data.

## Shared visual contract

Purple is the standard identity/action accent. Red is reserved for safety, warnings, pain/injury boundaries, destructive actions, or other semantic danger states. Exercise artwork remains grounded and instructional, while Raizen/Fenrir/mountain/storm/crown visuals carry app identity and motivation.

Desktop and mobile are both first-class layouts. Mobile Profile remains a character sheet rather than becoming a detached hero banner. Program and Progress retain fast horizontal tabs, Exercises keeps mobile filtering uncluttered, and all primary routes continue to use the existing navigation architecture.

## Governance guards

The installer and production audit reject direct use of localStorage, sessionStorage, IndexedDB, fetch/XHR, program-instance stores, training-max history, workout-session stores, personal-record stores, or bodyweight stores from this presentation bridge. It also rejects alternate exercise-image URLs. This is intentional: the redesign may arrange and style existing UI, but it must not become a competing data/program engine.
