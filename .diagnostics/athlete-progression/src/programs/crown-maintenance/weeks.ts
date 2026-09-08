import type { ExerciseCategory, ProgramExercise, ProgramSet, ProgramWeek } from '../../program-engine/types'

const s = (
  label: string,
  reps?: number | string,
  loadText?: string,
  notes?: string,
  meta?: Partial<Pick<ProgramSet, 'percentage' | 'loadReference' | 'rounding'>>,
): ProgramSet => ({ label, reps, loadText, notes, ...meta })

const ex = (
  id: string,
  name: string,
  category: ExerciseCategory,
  priority: ProgramExercise['priority'],
  sets: ProgramSet[],
  notes?: string,
): ProgramExercise => ({ id, name, category, priority, sets, notes, videoQuery: `${name} exercise tutorial` })

const pct = (
  label: string,
  reps: number | string,
  percentage: number | { min: number; max: number },
  loadReference: string,
  notes?: string,
): ProgramSet => {
  const text = typeof percentage === 'number' ? `${percentage}% of verified reference` : `${percentage.min}–${percentage.max}% of verified reference`
  return s(label, reps, text, notes, { percentage, loadReference, rounding: 'up-5' })
}

const warmStrength = (tibReps: number | string = 20): ProgramExercise[] => [
  ex('bike-incline-walk', 'Bike or Incline Walk', 'recovery', 'mandatory', [s('Easy', '5 min')], 'Raise temperature.'),
  ex('backward-sled-drag-primer', 'Backward Sled Drag', 'sled', 'mandatory', [s('1', '20 m', 'Light'), s('2', '20 m', 'Light'), s('3', '20 m', 'Light')], 'Knee-friendly primer.'),
  ex('glute-bridge-iso', 'Glute Bridge ISO', 'secondary', 'mandatory', [s('1', '20 sec'), s('2', '20 sec')], 'Hard squeeze.'),
  ex('tibialis-raise', 'Tibialis Raise', 'secondary', 'mandatory', [s('1', tibReps), s('2', tibReps)], 'Full controlled range.'),
]

const olympicPrep = (sets = 3): ProgramExercise[] => {
  const rs = (reps: number | string, loadText?: string) => Array.from({ length: sets }, (_, i) => s(String(i + 1), reps, loadText))
  return [
    ex('front-rack-mobility', 'Front Rack Mobility', 'power', 'mandatory', rs('30 sec'), 'Comfortable range.'),
    ex('muscle-clean', 'Muscle Clean', 'power', 'mandatory', rs(3, 'Light'), 'Smooth turnover.'),
    ex('tall-clean', 'Tall Clean', 'power', 'mandatory', rs(3, 'Light'), 'Fast elbows.'),
    ex('clean-grip-rdl-knee', 'Clean-Grip RDL to Knee', 'power', 'mandatory', rs(3, 'Light'), 'Hold position.'),
    ex('jump-stick-landing', 'Jump and Stick Landing', 'power', 'mandatory', rs(3), 'Quiet landing.'),
    ex('dead-bug-prep', 'Dead Bug', 'core', 'mandatory', rs('6/side'), 'Trunk control.'),
  ]
}

const recoveryFlow = (volume: 'low' | 'normal'): ProgramExercise[] => {
  const workSets = volume === 'low' ? 2 : 3
  const recoveryRounds = 2
  return [
    ex('turkish-get-up', 'Turkish Get-Up', 'kettlebell', 'conditional', Array.from({ length: recoveryRounds }, (_, i) => s(`R${i + 1}`, '1/side', '8 kg KB')), 'Light and smooth.'),
    ex('kettlebell-halo', 'Kettlebell Halo', 'kettlebell', 'conditional', Array.from({ length: recoveryRounds }, (_, i) => s(`R${i + 1}`, '5 each direction', '8 kg KB')), 'Slow range.'),
    ex('windmill', 'Windmill', 'kettlebell', 'conditional', Array.from({ length: recoveryRounds }, (_, i) => s(`R${i + 1}`, '3/side', '8 kg KB')), 'Controlled.'),
    ex('arm-bar', 'Arm Bar', 'recovery', 'conditional', Array.from({ length: recoveryRounds }, (_, i) => s(`R${i + 1}`, '3 breaths/side')), 'Shoulder restoration.'),
    ex('reverse-crunch', 'Reverse Crunch', 'core', 'mandatory', Array.from({ length: workSets }, (_, i) => s(String(i + 1), volume === 'low' ? 10 : 12)), 'Pelvic control.'),
    ex('cable-hip-flexor-march', 'Cable Hip Flexor March', 'core', 'mandatory', Array.from({ length: workSets }, (_, i) => s(String(i + 1), '10/leg')), 'Pause at top.'),
    ex('dead-bug-hold', 'Dead Bug Hold', 'core', 'mandatory', Array.from({ length: workSets }, (_, i) => s(String(i + 1), volume === 'low' ? '20 sec' : '25 sec')), 'Ribs down.'),
    ex('half-kneeling-chop', 'Half-Kneeling Chop', 'core', 'mandatory', Array.from({ length: workSets }, (_, i) => s(String(i + 1), '10/side')), 'Hips square.'),
    ex('half-kneeling-lift', 'Half-Kneeling Lift', 'core', 'mandatory', Array.from({ length: workSets }, (_, i) => s(String(i + 1), '10/side')), 'Control return.'),
    ex('backward-sled-drag', 'Backward Sled Drag', 'sled', 'mandatory', Array.from({ length: volume === 'low' ? 4 : 5 }, (_, i) => s(String(i + 1), '20 m', volume === 'low' ? 'Easy' : 'Easy–moderate')), 'Continuous steps.'),
    ex('leg-extension', 'Leg Extension', 'secondary', 'mandatory', Array.from({ length: workSets }, (_, i) => s(String(i + 1), volume === 'low' ? 15 : '12–15', volume === 'low' ? 'Easy' : undefined)), 'Controlled full range.'),
    ex('tibialis-raise', 'Tibialis Raise', 'secondary', 'mandatory', Array.from({ length: 3 }, (_, i) => s(String(i + 1), volume === 'low' ? 15 : 20)), 'Full range.'),
    ex('aerobic-recovery', 'Walk, Bike, or Elliptical', 'recovery', 'mandatory', [s('Easy', '25–30 min')], 'Conversational pace.'),
  ]
}

const pullWarmup = (): ProgramExercise[] => [
  ex('bike-walk', 'Bike or Walk', 'recovery', 'mandatory', [s('Easy', '5 min')], 'Raise temperature.'),
  ex('glute-bridge', 'Glute Bridge', 'secondary', 'mandatory', [s('1', 12), s('2', 12)], 'Controlled squeeze.'),
  ex('bird-dog', 'Bird Dog', 'core', 'mandatory', [s('1', '8/side'), s('2', '8/side')], 'No rotation.'),
  ex('lat-pulldown-warmup', 'Lat Pulldown Warm-Up', 'secondary', 'mandatory', [s('1', 10, 'Light'), s('2', 10, 'Light')], 'Move shoulder blades.'),
]

const upperSupport = (sets: number, effort: 6 | 7): ProgramExercise[] => [
  ex('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'secondary', 'conditional', Array.from({ length: sets }, (_, i) => s(String(i + 1), 8)), 'Strong scapular movement.'),
  ex('incline-db-press', 'Incline Dumbbell Press', 'secondary', 'conditional', Array.from({ length: Math.min(sets, 3) }, (_, i) => s(String(i + 1), 8, `RPE ${effort}`)), 'Controlled; stop well short of failure.'),
  ex('rear-delt-fly', 'Rear Delt Fly', 'secondary', 'conditional', Array.from({ length: Math.min(sets, 3) }, (_, i) => s(String(i + 1), 15)), 'Lead with elbows.'),
  ex('rope-pushdown', 'Rope Pushdown', 'secondary', 'conditional', Array.from({ length: Math.min(sets, 3) }, (_, i) => s(String(i + 1), 10)), effort === 6 ? 'Easy pump.' : 'Stop short of failure.'),
  ex('dumbbell-curl', 'Dumbbell Curl', 'secondary', 'conditional', Array.from({ length: Math.min(sets, 3) }, (_, i) => s(String(i + 1), 10)), effort === 6 ? 'Easy pump.' : 'Stop short of failure.'),
  ex('scap-push-up', 'Scap Push-Up', 'secondary', 'conditional', Array.from({ length: Math.min(sets, 3) }, (_, i) => s(String(i + 1), 10)), 'Move shoulder blades.'),
]

const fullBodyWarmup = (): ProgramExercise[] => [
  ex('bike-walk', 'Bike or Walk', 'recovery', 'mandatory', [s('Easy', '5 min')], 'Raise temperature.'),
  ex('backward-sled-drag-primer', 'Backward Sled Drag', 'sled', 'mandatory', [s('1', '20 m', 'Light'), s('2', '20 m', 'Light')], 'Primer only.'),
  ex('mini-band-lateral-walk', 'Mini-Band Lateral Walk', 'secondary', 'mandatory', [s('1', '10 each'), s('2', '10 each')], 'Hip control.'),
  ex('glute-bridge-iso', 'Glute Bridge ISO', 'secondary', 'mandatory', [s('1', '20 sec'), s('2', '20 sec')], 'Full squeeze.'),
  ex('kb-swing-primer', 'Kettlebell Swing', 'kettlebell', 'mandatory', [s('1', 10, 'Light'), s('2', 10, 'Light')], 'Crisp hinge.'),
]

const fullBodySupport = (volume: 'low' | 'normal' | 'activation'): ProgramExercise[] => {
  const n = volume === 'low' ? 2 : 3
  const isLow = volume === 'low'
  return [
    ex('romanian-deadlift', 'Romanian Deadlift', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), 8, `RPE ${isLow ? 6 : 7}`)), 'Submaximal.'),
    ex('step-up', 'Step-Up', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), '8/leg')), 'Controlled.'),
    ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), 12)), 'Ribs down.'),
    ex('lateral-raise', 'Lateral Raise', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), 15)), 'No momentum.'),
    ex('cable-press-around', 'Cable Press-Around', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), 12)), isLow ? 'Easy chest work.' : 'Controlled chest work.'),
    ex('rope-pushdown', 'Rope Pushdown', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), 10)), isLow ? 'Easy pump.' : 'Stop short of failure.'),
    ex('dumbbell-curl', 'Dumbbell Curl', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), 10)), isLow ? 'Easy pump.' : 'Stop short of failure.'),
    ex('rear-delt-fly', 'Rear Delt Fly', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), 15)), 'Lead with elbows.'),
    ex('push-up', 'Push-Up', 'secondary', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), isLow ? 8 : 10)), isLow ? 'Stop well short of fatigue.' : 'Clean reps only.'),
    ex('kb-lateral-lunge', 'Kettlebell Lateral Lunge', 'kettlebell', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), `${isLow ? 6 : 8}/side`)), 'Controlled range.'),
    ex(isLow ? 'side-plank' : 'copenhagen-plank', isLow ? 'Side Plank' : 'Copenhagen Plank', 'core', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), '20 sec/side')), 'Stay stacked.'),
    ex('offset-rack-march', 'Offset Rack March', 'carry', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), '20 steps/side')), 'Stay level.'),
    ex('dead-bug', 'Dead Bug', 'core', 'conditional', Array.from({ length: n }, (_, i) => s(String(i + 1), '8/side')), 'Ribs down.'),
  ]
}

export const CROWN_MAINTENANCE_WEEK_1: ProgramWeek = {
  week: 1,
  start: '2026-12-14',
  end: '2026-12-18',
  intent: 'Post-test consolidation: clear testing fatigue while retaining squat, bench, pull, Olympic, knee, and movement patterns.',
  days: [
    {
      day: 1, date: '2026-12-14', title: 'SQUAT + BENCH TECHNIQUE', role: 'Clear testing fatigue while retaining squat and bench positions.',
      readinessRule: 'Preserve clean squat + bench technique. Yellow keeps clean main work and trims assistance; maintenance is not a new progression block.',
      cutOrder: 'Trim secondary support before source squat/bench technique work.',
      sections: [
        { id: 'warmup', title: 'Warm-Up / Primer', exercises: warmStrength(15) },
        { id: 'main', title: 'Main Strength', exercises: [
          ex('front-squat', 'Front Squat', 'primary', 'mandatory', [pct('Work', 3, 65, 'verified-front-squat-1rm') , pct('Work 2', 3, 65, 'verified-front-squat-1rm'), pct('Work 3', 3, 65, 'verified-front-squat-1rm')], '3 × 3 total. Crisp position; rest 2–3 min.'),
          ex('bench-press', 'Bench Press', 'primary', 'mandatory', Array.from({ length: 4 }, (_, i) => pct(String(i + 1), 4, 65, 'verified-bench-press-1rm')), 'Controlled touch; rest 2 min.'),
          ex('chest-supported-row', 'Chest-Supported Row', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8)), 'Pause at top.'),
          ex('leg-extension', 'Leg Extension', 'secondary', 'conditional', [s('1', '12–15'), s('2', '12–15')], 'Easy knee-support work.'),
          ex('hanging-knee-raise', 'Hanging Knee Raise', 'core', 'conditional', [s('1', 10), s('2', 10)], 'No swinging.'),
          ex('backward-sled-drag-finish', 'Backward Sled Drag', 'sled', 'conditional', [s('1', '20 m', 'Light'), s('2', '20 m', 'Light'), s('3', '20 m', 'Light')], 'Easy finish.'),
        ] },
        { id: 'secondary', title: 'Secondary Support', exercises: [
          ex('hip-thrust', 'Hip Thrust', 'secondary', 'conditional', [s('1', 8, 'RPE 6'), s('2', 8, 'RPE 6')], 'Pause at lockout.'),
          ex('incline-db-press', 'Incline Dumbbell Press', 'secondary', 'conditional', [s('1', 8), s('2', 8)], 'Leave about four reps available.'),
        ] },
      ],
    },
    {
      day: 2, date: '2026-12-15', title: 'OLYMPIC + UPPER TECHNIQUE', role: 'Retain clean timing and upper-body movement quality without loading fatigue.',
      readinessRule: 'Olympic timing and upper quality are the target. End technical work before bar speed or positions change.',
      cutOrder: 'Trim arm/delt support first; no fatigue-chasing after clean or push-press work.',
      sections: [
        { id: 'olympic-prep', title: 'Olympic Prep', exercises: olympicPrep(3) },
        { id: 'receiving', title: 'Receiving Lift', exercises: [ex('hang-power-clean', 'Hang Power Clean', 'power', 'mandatory', Array.from({ length: 5 }, (_, i) => pct(String(i + 1), 2, 60, 'verified-clean-reference')), 'Crisp catches only; rest 75–90 sec.')] },
        { id: 'joint-support', title: 'Joint Support', exercises: [
          ex('cable-external-rotation', 'Cable External Rotation', 'secondary', 'conditional', [s('1', '12/side'), s('2', '12/side')]),
          ex('hip-flexor-rockback', 'Hip Flexor Rockback', 'recovery', 'conditional', [s('1', '6/side'), s('2', '6/side')]),
          ex('ankle-rock', 'Ankle Rock', 'recovery', 'conditional', [s('1', '6/side'), s('2', '6/side')]),
        ] },
        { id: 'pull-reset', title: 'Pull Reset', exercises: [
          ex('clean-pull', 'Clean Pull', 'power', 'mandatory', Array.from({ length: 3 }, (_, i) => pct(String(i + 1), 3, 70, 'verified-clean-reference')), 'Strong positions; rest 90 sec.'),
          ex('serratus-wall-slide', 'Serratus Wall Slide', 'secondary', 'conditional', [s('1', 8), s('2', 8)]),
          ex('t-spine-rotation', 'T-Spine Rotation', 'recovery', 'conditional', [s('1', '5/side'), s('2', '5/side')]),
          ex('wrist-pulses', 'Wrist Pulses', 'recovery', 'conditional', [s('1', '10 each'), s('2', '10 each')]),
        ] },
        { id: 'push-press', title: 'Push Press Support', exercises: [
          ex('push-press', 'Push Press', 'power', 'mandatory', [s('1', 4, 'RPE 6'), s('2', 4, 'RPE 6'), s('3', 4, 'RPE 6')], 'Crisp dip and drive.'),
          ex('band-pull-apart', 'Band Pull-Apart', 'secondary', 'conditional', [s('1', 20), s('2', 20)], 'Ribs down.'),
        ] },
        { id: 'upper-support', title: 'Upper Support', exercises: [...upperSupport(2, 6), ex('box-breathing', 'Box Breathing', 'recovery', 'optional', [s('Final', '2–4 min')], 'Final reset.')] },
      ],
    },
    {
      day: 3, date: '2026-12-16', title: 'RECOVERY + KNEES + HIP FLEXORS', role: 'Restore movement after testing while preserving knee, hip-flexor, and aerobic capacity.',
      readinessRule: 'Target restorative work only. Finish better than you started.', cutOrder: 'Anything that adds meaningful hinge, grip, or conditioning fatigue is removed.',
      sections: [{ id: 'recovery', title: 'Recovery / Knee / Trunk', exercises: recoveryFlow('low') }],
    },
    {
      day: 4, date: '2026-12-17', title: 'DEADLIFT + BENCH FREQUENCY', role: 'Retain deadlift and bench skill while testing fatigue continues to clear.',
      readinessRule: 'Deadlift + bench skill work stays smooth and repeatable.', cutOrder: 'Remove back/trunk support before changing clean main work.',
      sections: [
        { id: 'warmup', title: 'Warm-Up', exercises: pullWarmup() },
        { id: 'main', title: 'Main Pull / Hinge', exercises: [
          ex('deadlift', 'Deadlift', 'primary', 'mandatory', Array.from({ length: 3 }, (_, i) => pct(String(i + 1), 3, 65, 'verified-deadlift-1rm')), 'Reset each rep; rest 2–3 min.'),
          ex('bench-press', 'Bench Press', 'primary', 'mandatory', Array.from({ length: 4 }, (_, i) => pct(String(i + 1), 3, 70, 'verified-bench-press-1rm')), 'Fast bar speed; rest 2 min.'),
          ex('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8)), 'Controlled.'),
          ex('chest-supported-row', 'Chest-Supported Row', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8)), 'Pause at top.'),
          ex('hamstring-curl', 'Hamstring Curl', 'secondary', 'conditional', [s('1', 10), s('2', 10)], 'Control eccentric.'),
          ex('pallof-press', 'Pallof Press', 'core', 'conditional', [s('1', '10/side'), s('2', '10/side')], 'Do not rotate.'),
        ] },
        { id: 'back-trunk', title: 'Back / Trunk Support', exercises: [
          ex('cable-pullover', 'Cable Pullover', 'secondary', 'conditional', [s('1', 12), s('2', 12)], 'Ribs down.'),
          ex('face-pull', 'Face Pull', 'secondary', 'conditional', [s('1', 15), s('2', 15)], 'Shoulder support.'),
          ex('reverse-crunch', 'Reverse Crunch', 'core', 'conditional', [s('1', 10), s('2', 10)], 'Controlled.'),
          ex('easy-sled-drag', 'Easy Sled Drag', 'sled', 'optional', [s('1', '20 m'), s('2', '20 m'), s('3', '20 m')], 'Finish fresh.'),
        ] },
      ],
    },
    {
      day: 5, date: '2026-12-18', title: 'FULL-BODY CONSOLIDATION', role: 'Finish the post-test week with low-fatigue full-body work and normal movement rhythm.',
      readinessRule: 'Keep every rep clean and leave fatigue behind. This is consolidation, not a challenge day.', cutOrder: 'Easy finish → frontal/core extras → upper support → secondary volume. Protect clean full-body work.',
      sections: [
        { id: 'warmup', title: 'Warm-Up / Primer', exercises: fullBodyWarmup() },
        { id: 'main', title: 'Main Full Body', exercises: [
          ex('close-grip-bench', 'Close-Grip Bench Press', 'primary', 'mandatory', Array.from({ length: 3 }, (_, i) => pct(String(i + 1), 5, { min: 60, max: 65 }, 'verified-bench-press-1rm')), 'Easy speed; rest 2 min.'),
          ex('belt-squat', 'Belt Squat', 'secondary', 'mandatory', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8, 'RPE 6')), 'Stable stance.'),
          ex('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'secondary', 'mandatory', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10)), 'Smooth pulling.'),
          ex('kettlebell-swing', 'Kettlebell Swing', 'kettlebell', 'mandatory', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10, 'Moderate')), 'Explosive.'),
          ex('hanging-knee-raise', 'Hanging Knee Raise', 'core', 'conditional', [s('1', 10), s('2', 10)], 'No swing.'),
          ex('sled-push', 'Sled Push', 'sled', 'conditional', [s('1', '20 m', 'Easy'), s('2', '20 m', 'Easy'), s('3', '20 m', 'Easy')], 'Controlled.'),
        ] },
        { id: 'support', title: 'Secondary / Upper / Frontal Support', exercises: fullBodySupport('low') },
        { id: 'finish', title: 'Easy Finish', exercises: [
          ex('easy-engine', 'Bike, Row, or Elliptical', 'recovery', 'optional', [s('Easy', '10–15 min')], 'Conversational pace.'),
          ex('backward-sled-drag-finish', 'Backward Sled Drag', 'sled', 'optional', [s('1', '20 m', 'Easy'), s('2', '20 m', 'Easy')], 'Finish better than you started.'),
        ] },
      ],
    },
  ],
}

export const CROWN_MAINTENANCE_WEEK_2: ProgramWeek = {
  week: 2,
  start: '2026-12-21',
  end: '2026-12-26',
  intent: 'Strength retention at 310 Gym: touch meaningful intensity, preserve Olympic timing and normal frequency, and stop before bar speed or technique changes.',
  days: [
    {
      day: 1, date: '2026-12-21', title: 'SQUAT + BENCH STRENGTH RETENTION', role: 'Touch meaningful squat and bench intensity, then retain strength with controlled back-off volume.',
      readinessRule: 'This is maintenance, not a deload. Smooth reps only: no misses, grinders, AMRAPs, or full pyramids.', cutOrder: 'Accessories first. Main-lift retention has priority.',
      sections: [
        { id: 'warmup', title: 'Warm-Up / Primer', exercises: warmStrength(20) },
        { id: 'main', title: 'Main Strength', exercises: [
          ex('front-squat', 'Front Squat', 'primary', 'mandatory', [pct('Top single', 1, 85, 'verified-front-squat-1rm'), ...Array.from({ length: 4 }, (_, i) => pct(`Back-off ${i + 1}`, 3, 72.5, 'verified-front-squat-1rm'))], 'Smooth single; no grinder. Rest 2–3 min.'),
          ex('bench-press', 'Bench Press', 'primary', 'mandatory', Array.from({ length: 5 }, (_, i) => pct(String(i + 1), 4, 70, 'verified-bench-press-1rm')), 'Clean pauses and bar path. Rest 2–3 min.'),
          ex('chest-supported-row', 'Chest-Supported Row', 'secondary', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 8)), 'Pause at top.'),
          ex('hip-thrust', 'Hip Thrust', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8)), 'Strong lockout.'),
          ex('leg-extension', 'Leg Extension', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '12–15')), 'Controlled knee support.'),
          ex('backward-sled-drag', 'Backward Sled Drag', 'sled', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), '20 m', 'Moderate')), 'Repeatable steps.'),
        ] },
        { id: 'secondary', title: 'Secondary Support', exercises: [
          ex('incline-db-press', 'Incline Dumbbell Press', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8, 'RPE 7')), 'Leave about three reps available.'),
          ex('hamstring-curl', 'Hamstring Curl', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10)), 'Controlled eccentric.'),
          ex('lateral-raise', 'Lateral Raise', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 15)), 'No momentum.'),
          ex('hanging-knee-raise', 'Hanging Knee Raise', 'core', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10)), 'No swinging.'),
          ex('easy-incline-walk', 'Easy Incline Walk', 'recovery', 'optional', [s('Easy', '10 min')], 'Conversational pace.'),
        ] },
      ],
    },
    {
      day: 2, date: '2026-12-22', title: 'OLYMPIC + UPPER-BODY MAINTENANCE', role: 'Maintain Olympic timing, upper-body strength, shoulder support, and arm volume without interfering with pulling.',
      readinessRule: 'Every catch and pull stays crisp. No ugly pulls and no fatigue-chasing.', cutOrder: 'Arm/delt support first, then nonessential reset drills. Protect receiving lift, clean pull, and push-press quality.',
      sections: [
        { id: 'olympic-prep', title: 'Olympic Prep', exercises: olympicPrep(3) },
        { id: 'receiving', title: 'Receiving Lift', exercises: [ex('hang-power-clean', 'Hang Power Clean', 'power', 'mandatory', Array.from({ length: 6 }, (_, i) => pct(String(i + 1), 2, 70, 'verified-clean-reference')), 'Every catch crisp; rest 90 sec.')] },
        { id: 'joint-support', title: 'Joint Support', exercises: [
          ex('cable-external-rotation', 'Cable External Rotation', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '10/side'))),
          ex('hip-flexor-rockback', 'Hip Flexor Rockback', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '6/side'))),
          ex('ankle-rock', 'Ankle Rock', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '6/side'))),
        ] },
        { id: 'clean-pull-reset', title: 'Clean Pull Reset', exercises: [
          ex('clean-pull', 'Clean Pull', 'power', 'mandatory', Array.from({ length: 4 }, (_, i) => pct(String(i + 1), 3, 85, 'verified-clean-reference')), 'Strong posture; no ugly pulls. Rest 2 min.'),
          ex('serratus-wall-slide', 'Serratus Wall Slide', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8))),
          ex('t-spine-rotation', 'T-Spine Rotation', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '5/side'))),
          ex('wrist-pulses', 'Wrist Pulses', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '10 each'))),
        ] },
        { id: 'push-press', title: 'Push Press Support', exercises: [
          ex('push-press', 'Push Press', 'power', 'mandatory', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 4, 'RPE 7')), 'Crisp dip and lockout.'),
          ex('band-pull-apart', 'Band Pull-Apart', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 20)), 'Ribs down.'),
        ] },
        { id: 'upper-support', title: 'Upper Support', exercises: [...upperSupport(4, 7), ex('box-breathing', 'Box Breathing', 'recovery', 'optional', [s('Final', '2–4 min')], 'Final reset.')] },
      ],
    },
    {
      day: 3, date: '2026-12-23', title: 'RECOVERY + KNEES + HIP FLEXORS', role: 'Preserve recovery, knee tolerance, hip-flexor strength, and aerobic base between strength days.',
      readinessRule: 'Programmed recovery, not conditioning punishment. Finish better than you started.', cutOrder: 'Remove anything that adds hinge, grip, or conditioning fatigue before Day 4.',
      sections: [{ id: 'recovery', title: 'Recovery / Knee / Trunk', exercises: recoveryFlow('normal') }],
    },
    {
      day: 4, date: '2026-12-24', title: 'DEADLIFT + BENCH FREQUENCY', role: 'Maintain deadlift intensity, bench frequency, posterior-chain strength, and upper-back capacity.',
      readinessRule: 'Smooth repetitions only. Reset every deadlift rep and keep bench fast.', cutOrder: 'Tertiary posterior/yoke/trunk support first if grip or low-back quality changes.',
      sections: [
        { id: 'warmup', title: 'Warm-Up', exercises: pullWarmup() },
        { id: 'main', title: 'Main Pull / Hinge', exercises: [
          ex('deadlift', 'Deadlift', 'primary', 'mandatory', [pct('Top single', 1, 85, 'verified-deadlift-1rm'), ...Array.from({ length: 4 }, (_, i) => pct(`Back-off ${i + 1}`, 3, 72.5, 'verified-deadlift-1rm'))], 'Smooth single; reset every rep. Rest 2–3 min.'),
          ex('bench-press', 'Bench Press', 'primary', 'mandatory', Array.from({ length: 5 }, (_, i) => pct(String(i + 1), 3, 75, 'verified-bench-press-1rm')), 'Fast, repeatable reps. Rest 2 min.'),
          ex('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'secondary', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 8)), 'Drive elbows down.'),
          ex('chest-supported-row', 'Chest-Supported Row', 'secondary', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 8)), 'Pause at top.'),
          ex('hamstring-curl', 'Hamstring Curl', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10)), 'Control eccentric.'),
          ex('pallof-press', 'Pallof Press', 'core', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '10/side')), 'Do not rotate.'),
        ] },
        { id: 'back-yoke', title: 'Back / Yoke / Trunk', exercises: [
          ex('cable-pullover', 'Cable Pullover', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 12)), 'Ribs down.'),
          ex('face-pull', 'Face Pull', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 15)), 'Shoulder support.'),
          ex('suitcase-carry', 'Suitcase Carry', 'carry', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '30 m/side', 'Moderate')), 'No leaning.'),
          ex('reverse-crunch', 'Reverse Crunch', 'core', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 12)), 'Controlled.'),
        ] },
      ],
    },
    {
      day: 5, date: '2026-12-26', title: 'FULL-BODY MAINTENANCE / GPP', role: 'Retain secondary bench, lower-body volume, kettlebell power, carries, sleds, and conditioning without carrying fatigue into the next week.',
      readinessRule: 'Keep output repeatable and stop before fatigue changes movement quality.', cutOrder: 'Engine/sled finish → upper/frontal extras → secondary volume. Protect main full-body work.',
      sections: [
        { id: 'warmup', title: 'Warm-Up / Primer', exercises: fullBodyWarmup() },
        { id: 'main', title: 'Main Full Body', exercises: [
          ex('close-grip-bench', 'Close-Grip Bench Press', 'primary', 'mandatory', Array.from({ length: 4 }, (_, i) => pct(String(i + 1), 5, 70, 'verified-bench-press-1rm')), 'Fast reps; rest 2 min.'),
          ex('belt-squat', 'Belt Squat', 'secondary', 'mandatory', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 8, 'RPE 7')), 'Stable stance.'),
          ex('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'secondary', 'mandatory', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 10)), 'Smooth pulling.'),
          ex('kettlebell-swing', 'Kettlebell Swing', 'kettlebell', 'mandatory', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 10, 'Moderate')), 'Every set fast.'),
          ex('farmer-carry', 'Farmer Carry', 'carry', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '30 m', 'Moderate')), 'Posture tall; grip controlled.'),
          ex('sled-push', 'Sled Push', 'sled', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), '20 m', 'Moderate')), 'Repeatable output.'),
        ] },
        { id: 'support', title: 'Secondary / Upper / Frontal Support', exercises: fullBodySupport('normal') },
        { id: 'finish', title: 'Engine / Sled Finish', exercises: [
          ex('engine-intervals', 'Bike, Row, or Elliptical', 'recovery', 'optional', Array.from({ length: 6 }, (_, i) => s(String(i + 1), '60 sec', 'Moderate')), 'No maximal intervals.'),
          ex('backward-sled-drag-finish', 'Backward Sled Drag', 'sled', 'optional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '20 m', 'Easy')), 'Finish with clean movement.'),
        ] },
      ],
    },
  ],
}

export const CROWN_MAINTENANCE_WEEK_3: ProgramWeek = {
  week: 3,
  start: '2026-12-28',
  end: '2027-01-02',
  intent: 'Black Crown activation: retain meaningful intensity with slightly reduced volume and finish ready for the January 4 launch.',
  days: [
    {
      day: 1, date: '2026-12-28', title: 'SQUAT + BENCH STRENGTH RETENTION', role: 'Touch meaningful squat and bench intensity, then retain strength with controlled back-off volume.',
      readinessRule: 'Preserve technique and leave testing fatigue behind. Yellow trims assistance rather than turning maintenance into a progression block.', cutOrder: 'Assistance first. Keep clean main retention work.',
      sections: [
        { id: 'warmup', title: 'Warm-Up / Primer', exercises: warmStrength(20) },
        { id: 'main', title: 'Main Strength', exercises: [
          ex('front-squat', 'Front Squat', 'primary', 'mandatory', [pct('Top single', 1, 87.5, 'verified-front-squat-1rm'), ...Array.from({ length: 3 }, (_, i) => pct(`Back-off ${i + 1}`, 3, 75, 'verified-front-squat-1rm'))], 'Smooth single; no grinder. Rest 2–3 min.'),
          ex('bench-press', 'Bench Press', 'primary', 'mandatory', [pct('Top single', 1, 85, 'verified-bench-press-1rm'), ...Array.from({ length: 4 }, (_, i) => pct(`Back-off ${i + 1}`, 3, 75, 'verified-bench-press-1rm'))], 'Clean pauses and bar path. Rest 2–3 min.'),
          ex('chest-supported-row', 'Chest-Supported Row', 'secondary', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 8)), 'Pause at top.'),
          ex('hip-thrust', 'Hip Thrust', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8)), 'Strong lockout.'),
          ex('leg-extension', 'Leg Extension', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '12–15')), 'Controlled knee support.'),
          ex('backward-sled-drag', 'Backward Sled Drag', 'sled', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), '20 m', 'Moderate')), 'Repeatable steps.'),
        ] },
        { id: 'secondary', title: 'Secondary Support', exercises: [
          ex('incline-db-press', 'Incline Dumbbell Press', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8, 'RPE 7')), 'Leave about three reps available.'),
          ex('hamstring-curl', 'Hamstring Curl', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10)), 'Controlled eccentric.'),
          ex('lateral-raise', 'Lateral Raise', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 15)), 'No momentum.'),
        ] },
      ],
    },
    {
      day: 2, date: '2026-12-29', title: 'OLYMPIC + UPPER-BODY MAINTENANCE', role: 'Maintain Olympic timing, upper-body strength, shoulder support, and arm volume without interfering with pulling.',
      readinessRule: 'Quality outranks load. Leave Black Crown readiness intact.', cutOrder: 'Arm/delt support first. Protect receiving lift, clean pull, and push-press quality.',
      sections: [
        { id: 'olympic-prep', title: 'Olympic Prep', exercises: olympicPrep(3) },
        { id: 'receiving', title: 'Receiving Lift', exercises: [ex('hang-power-clean', 'Hang Power Clean', 'power', 'mandatory', Array.from({ length: 5 }, (_, i) => pct(String(i + 1), 2, 72.5, 'verified-clean-reference')), 'Every catch crisp; rest 90 sec.')] },
        { id: 'joint-support', title: 'Joint Support', exercises: [
          ex('cable-external-rotation', 'Cable External Rotation', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '10/side'))),
          ex('hip-flexor-rockback', 'Hip Flexor Rockback', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '6/side'))),
          ex('ankle-rock', 'Ankle Rock', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '6/side'))),
        ] },
        { id: 'clean-pull-reset', title: 'Clean Pull Reset', exercises: [
          ex('clean-pull', 'Clean Pull', 'power', 'mandatory', Array.from({ length: 4 }, (_, i) => pct(String(i + 1), 2, 90, 'verified-clean-reference')), 'Strong posture; no ugly pulls. Rest 2 min.'),
          ex('serratus-wall-slide', 'Serratus Wall Slide', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8))),
          ex('t-spine-rotation', 'T-Spine Rotation', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '5/side'))),
          ex('wrist-pulses', 'Wrist Pulses', 'recovery', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '10 each'))),
        ] },
        { id: 'push-press', title: 'Push Press Support', exercises: [
          ex('push-press', 'Push Press', 'power', 'mandatory', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 3, 'RPE 7')), 'Crisp dip and lockout.'),
          ex('band-pull-apart', 'Band Pull-Apart', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 20)), 'Ribs down.'),
        ] },
        { id: 'upper-support', title: 'Upper Support', exercises: [...upperSupport(4, 7), ex('box-breathing', 'Box Breathing', 'recovery', 'optional', [s('Final', '2–4 min')], 'Final reset.')] },
      ],
    },
    {
      day: 3, date: '2026-12-30', title: 'RECOVERY + KNEES + HIP FLEXORS', role: 'Preserve recovery, knee tolerance, hip-flexor strength, and aerobic base between the two strength days.',
      readinessRule: 'Target 30–45 restorative minutes. Finish better than you started.', cutOrder: 'Anything that adds meaningful hinge, grip, or conditioning fatigue before Day 4.',
      sections: [{ id: 'recovery', title: 'Recovery / Knee / Trunk', exercises: recoveryFlow('normal') }],
    },
    {
      day: 4, date: '2026-12-31', title: 'DEADLIFT + BENCH FREQUENCY', role: 'Maintain deadlift intensity, bench frequency, posterior-chain strength, and upper-back capacity.',
      readinessRule: 'Deadlift + bench retention/frequency work gets full rest. Cut tertiary support if grip or low-back quality changes.', cutOrder: 'Tertiary posterior/yoke/arm support first.',
      sections: [
        { id: 'warmup', title: 'Warm-Up', exercises: pullWarmup() },
        { id: 'main', title: 'Main Pull / Hinge', exercises: [
          ex('deadlift', 'Deadlift', 'primary', 'mandatory', [pct('Top single', 1, 87.5, 'verified-deadlift-1rm'), ...Array.from({ length: 3 }, (_, i) => pct(`Back-off ${i + 1}`, 3, 75, 'verified-deadlift-1rm'))], 'Smooth single; reset every rep. Rest 2–3 min.'),
          ex('bench-press', 'Bench Press', 'primary', 'mandatory', Array.from({ length: 4 }, (_, i) => pct(String(i + 1), 3, 77.5, 'verified-bench-press-1rm')), 'Fast, repeatable reps. Rest 2 min.'),
          ex('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'secondary', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 8)), 'Drive elbows down.'),
          ex('chest-supported-row', 'Chest-Supported Row', 'secondary', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 8)), 'Pause at top.'),
          ex('hamstring-curl', 'Hamstring Curl', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10)), 'Control eccentric.'),
          ex('pallof-press', 'Pallof Press', 'core', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '10/side')), 'Do not rotate.'),
        ] },
        { id: 'back-yoke', title: 'Back / Yoke / Trunk', exercises: [
          ex('cable-pullover', 'Cable Pullover', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 12)), 'Ribs down.'),
          ex('face-pull', 'Face Pull', 'secondary', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 15)), 'Shoulder support.'),
          ex('suitcase-carry', 'Suitcase Carry', 'carry', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '30 m/side', 'Moderate')), 'No leaning.'),
          ex('reverse-crunch', 'Reverse Crunch', 'core', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 12)), 'Controlled.'),
        ] },
      ],
    },
    {
      day: 5, date: '2027-01-02', title: 'FULL-BODY MAINTENANCE / GPP', role: 'Retain secondary bench, lower-body volume, kettlebell power, carries, sleds, and conditioning without carrying fatigue into Black Crown.',
      readinessRule: 'Finish ready for January 4. No fatigue debt, no maximal intervals, no grinders.', cutOrder: 'Easy finish → upper/frontal extras → secondary volume. Protect clean main full-body work.',
      sections: [
        { id: 'warmup', title: 'Warm-Up / Primer', exercises: fullBodyWarmup() },
        { id: 'main', title: 'Main Full Body', exercises: [
          ex('close-grip-bench', 'Close-Grip Bench Press', 'primary', 'mandatory', Array.from({ length: 4 }, (_, i) => pct(String(i + 1), 4, 72.5, 'verified-bench-press-1rm')), 'Fast reps; rest 2 min.'),
          ex('belt-squat', 'Belt Squat', 'secondary', 'mandatory', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 8, 'RPE 7')), 'Stable stance.'),
          ex('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'secondary', 'mandatory', Array.from({ length: 4 }, (_, i) => s(String(i + 1), 10)), 'Smooth pulling.'),
          ex('kettlebell-swing', 'Kettlebell Swing', 'kettlebell', 'mandatory', Array.from({ length: 3 }, (_, i) => s(String(i + 1), 10, 'Moderate')), 'Every set fast.'),
          ex('farmer-carry', 'Farmer Carry', 'carry', 'conditional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '30 m', 'Moderate')), 'Posture tall; grip controlled.'),
          ex('sled-push', 'Sled Push', 'sled', 'conditional', Array.from({ length: 4 }, (_, i) => s(String(i + 1), '20 m', 'Moderate')), 'Repeatable output.'),
        ] },
        { id: 'support', title: 'Secondary / Upper / Frontal Support', exercises: fullBodySupport('activation') },
        { id: 'finish', title: 'Easy Finish', exercises: [
          ex('easy-engine', 'Bike, Row, or Elliptical', 'recovery', 'optional', [s('Easy', '12–15 min')], 'Conversational pace.'),
          ex('backward-sled-drag-finish', 'Backward Sled Drag', 'sled', 'optional', Array.from({ length: 3 }, (_, i) => s(String(i + 1), '20 m', 'Easy')), 'Finish fresh.'),
        ] },
      ],
    },
  ],
}

export const CROWN_MAINTENANCE_WEEKS = [CROWN_MAINTENANCE_WEEK_1, CROWN_MAINTENANCE_WEEK_2, CROWN_MAINTENANCE_WEEK_3]
