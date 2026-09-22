(() => {
  'use strict'
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
  function classify(name, prescription = '') {
    const value = clean(name)
    const exercise = window.LetMeFlyExerciseIntelligence?.getExercise?.(value)
    const equipment = exercise?.equipment || []
    const explicitNonBar = /\b(?:dbs?|dumbbells?|kbs?|kettlebells?|cable|machine|sled|body\s?weight|band|plate|goblet|belt|split|landmine|smith)\b/i.test(value)
    const choice = /\s(?:\/|or)\s/i.test(value)
    const barbell = !explicitNonBar && !choice && (equipment.length
      ? equipment.some(item => /^barbell$/i.test(item)) && !equipment.some(item => /dumbbell|kettlebell|cable|machine/i.test(item))
      : /\bbarbell\b/i.test(value) || /^(?:(?:paused?|tempo|hang|tall|muscle|power|clean[- ]grip|close[- ]grip)\s+)*(?:front squat|back squat|box squat|jm press|close-grip\/pause bench press|bench press|deadlift|rdl|romanian deadlift|overhead press|ohp|push press|strict press|good morning|hip thrust|rack pull|clean|clean pull|snatch|high pull|jerk|bar row|bent[- ]over row)(?:\s+(?:to knee|governed attempts))?$/i.test(value))
    const dumbbell = /\b(?:dbs?|dumbbells?)\b/i.test(value+' '+prescription)
      || (!choice && equipment.length === 1 && /^dumbbell$/i.test(equipment[0]))
    const cardio = equipment.some(item => /^cardio machine$/i.test(item))
      || /conditioning|recovery/i.test(exercise?.trainingCategory || '')
      || /^(?:bike|stationary bike|incline walk|walking|row|elliptical)(?:\s*(?:\/|or)\s*(?:bike|stationary bike|incline walk|walking|walk|row|elliptical))*$/i.test(value)
    return {barbell, dumbbell, cardio}
  }
  window.LetMeFlyExercisePresentation = Object.freeze({classify})
})()
