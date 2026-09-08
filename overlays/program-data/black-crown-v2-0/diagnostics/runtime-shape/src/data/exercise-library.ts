export type ExerciseVideoStatus =
  | 'direct-source-library'
  | 'plan-linked-search'
  | 'search-fallback'

export interface ExerciseLibraryRecord {
  id: string
  canonicalName: string
  sourcePrograms: string[]
  roles: string[]
  equipment: string[]
  videoStatus: ExerciseVideoStatus
  demoUrl: string
  aliases?: string[]
}

export interface ApprovedSubstitution {
  program: 'Crownforge' | 'Black Crown' | 'Crown Maintenance' | 'Reforge'
  primary: string
  alternative: string
  roles: string[]
  alternativeEquipment: string[]
  loadingAdjustment: string
  approvalSource: string
  weeksSeen: string
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[+/]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function direct(
  name: string,
  url: string,
  programs: string[] = [],
  roles: string[] = [],
  equipment: string[] = [],
  aliases: string[] = [],
): ExerciseLibraryRecord {
  return {
    id: slug(name),
    canonicalName: name,
    sourcePrograms: programs,
    roles,
    equipment,
    videoStatus: 'direct-source-library',
    demoUrl: url,
    aliases,
  }
}

function plan(
  name: string,
  url: string,
  programs: string[] = [],
  roles: string[] = [],
  equipment: string[] = [],
  aliases: string[] = [],
): ExerciseLibraryRecord {
  return {
    id: slug(name),
    canonicalName: name,
    sourcePrograms: programs,
    roles,
    equipment,
    videoStatus: 'plan-linked-search',
    demoUrl: url,
    aliases,
  }
}

function fallback(
  name: string,
  url: string,
  programs: string[] = [],
  roles: string[] = [],
  equipment: string[] = [],
  aliases: string[] = [],
): ExerciseLibraryRecord {
  return {
    id: slug(name),
    canonicalName: name,
    sourcePrograms: programs,
    roles,
    equipment,
    videoStatus: 'search-fallback',
    demoUrl: url,
    aliases,
  }
}

// Source: Crown System Master Training Workbook 2026-2027,
// EXERCISE DEMO LIBRARY sheet. The workbook contains 202 active-plan exercises.
// This embedded slice covers every exercise name currently used by structured
// Crownforge v2.1 and the mandatory Crown Maintenance bridge. The source workbook
// contains additional future-plan rows that can be added without changing the resolver/API below.
export const EXERCISE_LIBRARY: ExerciseLibraryRecord[] = [
  plan('90/90 Breathing', 'https://www.youtube.com/results?search_query=90/90%20Breathing%20exercise', ['Crownforge'], ['Mobility Reset']),
  plan('Ankle Rock', 'https://www.youtube.com/results?search_query=Ankle+Rock+exercise', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  fallback('Arm Bar', 'https://www.youtube.com/results?search_query=Arm+Bar+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  plan('Back Squat', 'https://www.youtube.com/results?search_query=Back+Squat+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Crownforge Testing'], [], ['Barbell']),
  plan('Backward Sled Drag', 'https://www.youtube.com/results?search_query=EliteFTS+Backward+Sled+Drag+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Sled / Prowler']),
  direct('Band Pull-Apart', 'https://vimeo.com/151349655', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Band']),
  fallback('Belt Squat', 'https://www.youtube.com/results?search_query=Belt+Squat+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  direct('Bench Press', 'https://vimeo.com/152122944', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Crownforge Testing', 'Reforge'], [], ['Barbell']),
  fallback('Bird Dog', 'https://www.youtube.com/results?search_query=Bird+Dog+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight']),
  plan('Box Breathing', 'https://www.youtube.com/results?search_query=Box+Breathing+exercise', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  plan('Cable External Rotation', 'https://www.youtube.com/results?search_query=Cable+External+Rotation+or+Serratus+Wall+Slide+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cable']),
  fallback('Cable March', 'https://www.youtube.com/results?search_query=Cable+March+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance'], [], ['Cable'], ['Band or Cable March', 'Cable Hip Flexor March']),
  fallback('Cable Press-Around', 'https://www.youtube.com/results?search_query=Cable+Press-Around+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cable']),
  fallback('Cable Pullover', 'https://www.youtube.com/results?search_query=Cable+Pullover+exercise+tutorial', ['Crownforge', 'Crown Maintenance', 'Reforge'], [], ['Cable']),
  fallback('Chest-Supported Row', 'https://www.youtube.com/results?search_query=Chest-Supported+Row+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Dumbbell']),
  plan('Chest-Supported Shrug', 'https://www.youtube.com/results?search_query=YouTube+Search+Chest-Supported+Shrug+exercise+tutorial', ['Crownforge', 'Black Crown', 'Reforge']),
  plan('Close-Grip Bench Press', 'https://www.youtube.com/results?search_query=Close-Grip+Bench+Press+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance'], [], ['Barbell']),
  direct('Clean-Grip RDL to Knee', 'https://vimeo.com/151480359', ['Crownforge', 'Crown Maintenance', 'Reforge'], [], ['Barbell']),
  direct('Clean Pull', 'https://vimeo.com/151365440', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Barbell']),
  fallback('Copenhagen Plank', 'https://www.youtube.com/results?search_query=Copenhagen+Plank+exercise+tutorial', ['Crownforge', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight']),
  direct('Dead Bug', 'https://vimeo.com/151346403', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight'], ['Dead Bug Hold']),
  fallback('Dead Bug Pullover', 'https://www.youtube.com/results?search_query=Kettlebell+Pullover+exercise+tutorial', ['Crownforge', 'Black Crown'], [], ['Kettlebell']),
  plan('Deadlift', 'https://www.youtube.com/results?search_query=Juggernaut+Training+Systems+Deadlift+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Crownforge Testing', 'Reforge'], [], ['Barbell']),
  plan('Dumbbell Curl', 'https://www.youtube.com/results?search_query=DB+Curl+or+Cable+Curl+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Dumbbell'], ['DB Curl']),
  fallback('Elliptical', 'https://www.youtube.com/results?search_query=Elliptical+exercise+tutorial', ['Crown Maintenance'], [], ['Cardio Machine']),
  direct('Face Pull', 'https://vimeo.com/151365424', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cable']),
  plan('Farmer Carry', 'https://www.youtube.com/results?search_query=Farmer+Carry+exercise+tutorial', ['Crown Maintenance', 'Black Crown'], [], ['Dumbbell', 'Kettlebell']),
  plan('Forward Sled Push', 'https://www.youtube.com/results?search_query=EliteFTS+Forward+Sled+Push+exercise+tutorial', ['Crownforge', 'Black Crown'], [], ['Sled / Prowler'], ['Light Forward Sled Push']),
  plan('Front Rack Mobility', 'https://www.youtube.com/results?search_query=Front+Rack+Mobility+exercise', ['Crownforge', 'Crown Maintenance', 'Crownforge Testing', 'Reforge']),
  direct('Front Squat', 'https://vimeo.com/152122947', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Crownforge Testing', 'Reforge'], [], ['Barbell']),
  direct('Glute Bridge', 'https://vimeo.com/151349622', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight']),
  direct('Glute Bridge Isometric Hold', 'https://vimeo.com/151349622', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight'], ['Glute Bridge ISO']),
  direct('Goblet Squat', 'https://vimeo.com/152122978', ['Crownforge', 'Black Crown', 'Reforge'], [], ['Kettlebell']),
  plan('Half-Kneeling Chop', 'https://www.youtube.com/results?search_query=Half-Kneeling%20Chop%20exercise', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  plan('Half-Kneeling Lift', 'https://www.youtube.com/results?search_query=Half-Kneeling%20Lift%20exercise', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  fallback('Leg Extension', 'https://www.youtube.com/results?search_query=Leg+Extension+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Machine']),
  plan('Hamstring Curl', 'https://www.youtube.com/results?search_query=Snatch-Grip+Romanian+Deadlift+or+Hamstring+Curl+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  plan('Hang Power Clean', 'https://www.youtube.com/results?search_query=Catalyst+Athletics+Hang+Power+Clean+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  fallback('Hanging Knee Raise', 'https://www.youtube.com/results?search_query=Hanging+Knee+Raise+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight']),
  plan('Hip Flexor Rockback', 'https://www.youtube.com/results?search_query=Hip%20Flexor%20Rockback%20exercise', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  fallback('Hip Hinge Drill', 'https://www.youtube.com/results?search_query=Hip+Hinge+Drill+exercise+tutorial', ['Crownforge', 'Black Crown']),
  fallback('Hip Thrust', 'https://www.youtube.com/results?search_query=Hip+Thrust+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Barbell']),
  plan('Hollow Hold', 'https://www.youtube.com/results?search_query=Dead%20Bug%20or%20Hollow%20Hold%20exercise', ['Crownforge']),
  plan('Incline DB Press', 'https://www.youtube.com/results?search_query=Incline%20DB%20Press%20exercise', ['Crownforge', 'Crown Maintenance'], [], ['Dumbbell'], ['Incline Dumbbell Press']),
  fallback('Incline Walk', 'https://www.youtube.com/results?search_query=Incline+Walk+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cardio Machine'], ['Easy Incline Walk']),
  plan('JM Press', 'https://www.youtube.com/results?search_query=JM%20Press%20exercise', ['Crownforge', 'Reforge']),
  plan('Jump and Stick Landing', 'https://www.youtube.com/results?search_query=Jump+and+Stick+Landing+exercise', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  fallback('Kettlebell Halo', 'https://www.youtube.com/results?search_query=Kettlebell+Halo+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Kettlebell'], ['KB Halo']),
  plan('KB Lateral Clean', 'https://www.youtube.com/results?search_query=KB%20Lateral%20Clean%20or%20Outside%20Swing%20to%20Rack%20exercise', ['Crownforge']),
  plan('KB Lateral Lunge', 'https://www.youtube.com/results?search_query=KB%20Lateral%20Lunge%20exercise', ['Crownforge', 'Crown Maintenance'], [], ['Kettlebell'], ['Kettlebell Lateral Lunge']),
  plan('Overhead Press', 'https://www.youtube.com/results?search_query=Overhead+Press+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crownforge Testing'], [], ['Barbell'], ['OHP']),
  plan('Outside Swing to Rack', 'https://www.youtube.com/results?search_query=KB%20Lateral%20Clean%20or%20Outside%20Swing%20to%20Rack%20exercise', ['Crownforge']),
  direct('Kettlebell Swing', 'https://vimeo.com/151480380', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Kettlebell'], ['KB Swing']),
  direct('Lat Pulldown', 'https://vimeo.com/152123045', ['Crownforge', 'Black Crown', 'Reforge'], [], ['Cable']),
  plan('Lat Pulldown Warm-Up', 'https://www.youtube.com/results?search_query=Renaissance+Periodization+Lat+Pulldown+Warm-Up+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  fallback('Lateral Raise', 'https://www.youtube.com/results?search_query=Lateral+Raise+exercise+tutorial', ['Crownforge', 'Crown Maintenance', 'Reforge'], [], ['Dumbbell', 'Cable', 'Band']),
  fallback('Mini-Band Lateral Walk', 'https://www.youtube.com/results?search_query=Mini-Band+Lateral+Walk+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Band']),
  plan('Mobility Flow', 'https://www.youtube.com/results?search_query=YouTube+Search+Mobility+Flow+exercise+tutorial', ['Black Crown'], [], [], ['Mobility']),
  fallback('Muscle Clean', 'https://www.youtube.com/results?search_query=Muscle+Clean+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Barbell']),
  direct('Neutral-Grip Lat Pulldown', 'https://vimeo.com/152123045', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cable'], ['Neutral-Grip Pulldown']),
  fallback('Offset Rack March', 'https://www.youtube.com/results?search_query=Offset+Rack+March+exercise+tutorial', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  direct('Pallof Press', 'https://vimeo.com/151365416', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cable', 'Band']),
  fallback('Plank Shoulder Tap', 'https://www.youtube.com/results?search_query=Plank+Shoulder+Tap+exercise+tutorial', ['Crownforge'], [], ['Bodyweight']),
  plan('Power Clean', 'https://www.youtube.com/results?search_query=Catalyst+Athletics+Power+Clean+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crownforge Testing'], [], ['Barbell']),
  plan('Power Snatch', 'https://www.youtube.com/results?search_query=Catalyst+Athletics+Power+Snatch+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crownforge Testing'], [], ['Barbell']),
  direct('Pull-Up', 'https://vimeo.com/152123002', ['Crownforge', 'Black Crown'], [], ['Bodyweight']),
  direct('Push Press', 'https://vimeo.com/152122951', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Barbell']),
  direct('Push-Up', 'https://vimeo.com/152122999', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight']),
  fallback('Rear Deltoid Fly', 'https://www.youtube.com/results?search_query=Reverse+Fly+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Dumbbell', 'Cable'], ['Rear Delt Fly']),
  direct('Reverse Crunch', 'https://vimeo.com/151366446', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight']),
  direct('Romanian Deadlift', 'https://vimeo.com/151480359', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Barbell'], ['RDL']),
  plan('Rope Pushdown', 'https://www.youtube.com/results?search_query=Rope+Pushdown+or+Cable+Pressdown+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cable']),
  direct('Row', 'https://vimeo.com/151366453', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Cardio Machine']),
  direct('Scapular Push-Up', 'https://vimeo.com/152122999', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Bodyweight'], ['Scap Push-Up']),
  fallback('Serratus Wall Slide', 'https://www.youtube.com/results?search_query=Serratus+Wall+Slide+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  fallback('Sled Drag', 'https://www.youtube.com/results?search_query=Sled+Drag+exercise+tutorial', ['Crownforge', 'Crown Maintenance', 'Crownforge Testing'], [], ['Sled / Prowler']),
  direct('Side Plank', 'https://vimeo.com/151366458', ['Black Crown', 'Crown Maintenance'], [], ['Bodyweight']),
  direct('Sled Push', 'https://vimeo.com/151480399', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Sled / Prowler']),
  fallback('Stationary Bike', 'https://www.youtube.com/results?search_query=Assault+Bike+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Crownforge Testing', 'Reforge'], [], ['Cardio Machine']),
  direct('Step-Up', 'https://vimeo.com/152122946', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  plan('Straight-Arm Pulldown', 'https://www.youtube.com/results?search_query=Straight-Arm%20Pulldown%20exercise', ['Crownforge', 'Crown Maintenance', 'Reforge']),
  plan('Suitcase Carry', 'https://www.youtube.com/results?search_query=Suitcase+Carry+exercise+tutorial', ['Crown Maintenance', 'Black Crown'], [], ['Dumbbell', 'Kettlebell']),
  plan('Suitcase March', 'https://www.youtube.com/results?search_query=Suitcase%20March%20exercise', ['Crownforge']),
  plan('T-Spine Rotation', 'https://www.youtube.com/results?search_query=T-Spine+Rotation+exercise', ['Crownforge', 'Crown Maintenance', 'Crownforge Testing', 'Reforge']),
  plan('Tall Clean', 'https://www.youtube.com/results?search_query=Tall+Clean+or+Muscle+Clean+Drill+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  fallback('Tibialis Raise', 'https://www.youtube.com/results?search_query=Tibialis+Raise+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge']),
  direct('Turkish Get-Up', 'https://vimeo.com/151366474', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Kettlebell']),
  fallback('Walking', 'https://www.youtube.com/results?search_query=Easy+Walk+exercise+tutorial', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Crownforge Testing', 'Reforge'], [], [], ['Optional Easy Walk']),
  direct('Wide-Grip Lat Pulldown', 'https://vimeo.com/152123045', ['Crownforge', 'Reforge'], [], ['Cable']),
  direct('Windmill', 'https://vimeo.com/151366473', ['Crownforge', 'Black Crown', 'Crown Maintenance', 'Reforge'], [], ['Kettlebell']),
  plan('Wrist Flexor/Extensor Pulses', 'https://www.youtube.com/results?search_query=Wrist+Flexor%2FExtensor+Pulses+exercise', ['Crownforge', 'Crown Maintenance', 'Reforge'], [], [], ['Wrist Pulses']),
  plan('Kettlebell Front Rack Carry', 'https://www.youtube.com/results?search_query=StrongFirst+Kettlebell+Front+Rack+Carry+exercise+tutorial', ['Black Crown'], ['CROWN'], ['Kettlebell'], ['Front Rack Carry']),
]

const COMPOSITE_MATCHES: Record<string, string[]> = {
  'Front Squat + Bench Ramp Sets': ['Front Squat', 'Bench Press'],
  'Bike / Incline Walk': ['Stationary Bike', 'Incline Walk'],
  'Bike / Row / Walk': ['Stationary Bike', 'Row', 'Walking'],
  'Bike / Walk': ['Stationary Bike', 'Walking'],
  'Bike or Walk': ['Stationary Bike', 'Walking'],
  'Bike or Incline Walk': ['Stationary Bike', 'Incline Walk'],
  'Bike, Row, or Elliptical': ['Stationary Bike', 'Row', 'Elliptical'],
  'Walk, Bike, or Elliptical': ['Walking', 'Stationary Bike', 'Elliptical'],
  'Walk or Bike': ['Walking', 'Stationary Bike'],
  'Easy Sled Drag': ['Sled Drag', 'Backward Sled Drag'],
  'Dead Bug or Hollow Hold': ['Dead Bug', 'Hollow Hold'],
  'Reverse Crunch or Dead Bug': ['Reverse Crunch', 'Dead Bug'],
  'Pull-Up or Lat Pulldown': ['Pull-Up', 'Lat Pulldown'],
  'Wide or Neutral Pulldown': ['Wide-Grip Lat Pulldown', 'Neutral-Grip Lat Pulldown'],
  'KB Lateral Clean or Outside Swing to Rack': ['KB Lateral Clean', 'Outside Swing to Rack'],
}

const BY_NAME = new Map<string, ExerciseLibraryRecord>()

for (const record of EXERCISE_LIBRARY) {
  BY_NAME.set(record.canonicalName.toLowerCase(), record)
  for (const alias of record.aliases ?? []) BY_NAME.set(alias.toLowerCase(), record)
}

export function getExerciseMatches(programName: string): ExerciseLibraryRecord[] {
  const composite = COMPOSITE_MATCHES[programName]
  if (composite) {
    return composite
      .map((name) => BY_NAME.get(name.toLowerCase()))
      .filter((item): item is ExerciseLibraryRecord => Boolean(item))
  }

  const directMatch = BY_NAME.get(programName.toLowerCase())
  return directMatch ? [directMatch] : []
}

export function getPrimaryExerciseMatch(programName: string): ExerciseLibraryRecord | null {
  return getExerciseMatches(programName)[0] ?? null
}

export function exerciseVideoStatusLabel(status: ExerciseVideoStatus): string {
  if (status === 'direct-source-library') return 'Direct source video'
  if (status === 'plan-linked-search') return 'Plan-linked demo/search'
  return 'Search fallback — exact video not yet approved'
}

export function safeFallbackSearchUrl(programName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${programName} exercise tutorial`)}`
}

const STANDARD_LOADING_ADJUSTMENT =
  'Match the written reps and effort. Recalculate percentage work from the correct parent TM; use RPE when no TM exists.'

// Crownforge rows verified from the source-approved ALTERNATIVE EXERCISES sheet.
// These are suggestions only. Choosing one must create a private coaching/substitution
// record; it must never rewrite the public Crownforge definition.
export const APPROVED_SUBSTITUTIONS: ApprovedSubstitution[] = [
  {
    program: 'Crownforge',
    primary: 'Band',
    alternative: 'Cable March',
    roles: [],
    alternativeEquipment: ['Cable'],
    loadingAdjustment: STANDARD_LOADING_ADJUSTMENT,
    approvalSource: 'Program-listed option',
    weeksSeen: 'Crownforge W1-W12',
  },
  {
    program: 'Crownforge',
    primary: 'Dead Bug',
    alternative: 'Hollow Hold',
    roles: ['core', 'trunk'],
    alternativeEquipment: [],
    loadingAdjustment: STANDARD_LOADING_ADJUSTMENT,
    approvalSource: 'Program-listed option',
    weeksSeen: 'Crownforge W1-W12',
  },
  {
    program: 'Crownforge',
    primary: 'KB Lateral Clean',
    alternative: 'Outside Swing to Rack',
    roles: ['frontal plane', 'lateral core'],
    alternativeEquipment: ['Kettlebell'],
    loadingAdjustment: STANDARD_LOADING_ADJUSTMENT,
    approvalSource: 'Program-listed option',
    weeksSeen: 'Crownforge W1-W12',
  },
  {
    program: 'Crownforge',
    primary: 'Pull-Up',
    alternative: 'Lat Pulldown',
    roles: ['main pull / hinge', 'secondary'],
    alternativeEquipment: ['Cable', 'Band'],
    loadingAdjustment: STANDARD_LOADING_ADJUSTMENT,
    approvalSource: 'Program-listed option',
    weeksSeen: 'Crownforge W1-W12',
  },
  {
    program: 'Crownforge',
    primary: 'Reverse Crunch',
    alternative: 'Dead Bug',
    roles: ['back / trunk', 'hip flexor / trunk', 'core'],
    alternativeEquipment: ['Bodyweight', 'Band', 'Kettlebell'],
    loadingAdjustment: STANDARD_LOADING_ADJUSTMENT,
    approvalSource: 'Program-listed option',
    weeksSeen: 'Crownforge W1-W12',
  },
  {
    program: 'Crownforge',
    primary: 'Wide',
    alternative: 'Neutral-Grip Lat Pulldown',
    roles: ['pulldown'],
    alternativeEquipment: ['Cable', 'Band'],
    loadingAdjustment: STANDARD_LOADING_ADJUSTMENT,
    approvalSource: 'Program-listed option',
    weeksSeen: 'Crownforge W1-W12',
  },
  {
    program: 'Crownforge',
    primary: 'Walking',
    alternative: 'Stationary Bike',
    roles: ['recovery', 'easy cardio'],
    alternativeEquipment: ['Cardio Machine'],
    loadingAdjustment: STANDARD_LOADING_ADJUSTMENT,
    approvalSource: 'Program-listed option',
    weeksSeen: 'Crownforge W1-W12',
  },
]

const PROGRAM_NAME_TO_SUB_PRIMARY: Record<string, string[]> = {
  'Band or Cable March': ['Band'],
  'Dead Bug or Hollow Hold': ['Dead Bug'],
  'KB Lateral Clean or Outside Swing to Rack': ['KB Lateral Clean'],
  'Pull-Up or Lat Pulldown': ['Pull-Up'],
  'Reverse Crunch or Dead Bug': ['Reverse Crunch'],
  'Wide or Neutral Pulldown': ['Wide'],
  'Bike / Walk': ['Walking'],
  'Bike or Walk': ['Walking'],
  'Walk or Bike': ['Walking'],
  'Bike / Row / Walk': ['Walking'],
  'Optional Easy Walk': ['Walking'],
}

export function getApprovedSubstitutions(
  programName: string,
  program: ApprovedSubstitution['program'] = 'Crownforge',
): ApprovedSubstitution[] {
  const primaries = new Set([
    programName,
    ...(PROGRAM_NAME_TO_SUB_PRIMARY[programName] ?? []),
    ...getExerciseMatches(programName).map((record) => record.canonicalName),
  ])

  return APPROVED_SUBSTITUTIONS.filter(
    (row) => row.program === program && primaries.has(row.primary),
  )
}

export const EXERCISE_LIBRARY_SOURCE_TOTAL = 202
export const APPROVED_SUBSTITUTION_SOURCE_TOTAL = 68
