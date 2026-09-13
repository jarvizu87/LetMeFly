import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCoachSafetyContext, coachSafetyResponse } from '../overlays/athlete-insights-v1/coach-safety-guard-v1.mjs'

test('red flags outrank routine limitation guidance', () => {
  const kind = classifyCoachSafetyContext('Severe pain after acute trauma, significant swelling, major instability and inability to bear weight with neurological symptoms.')
  assert.equal(kind, 'red-flag')
  const response = coachSafetyResponse(kind)
  assert.match(response.body, /stop the training session/i)
  assert.match(response.body, /qualified medical professional/i)
  assert.match(response.body, /cannot diagnose/i)
  assert.doesNotMatch(response.body, /push through|train through/i)
})

test('hip limitation avoids provocative deep-flexion substitutions', () => {
  const kind = classifyCoachSafetyContext('Anterior hip pinching during deep hip flexion and deep squats.')
  assert.equal(kind, 'hip-limitation')
  const response = coachSafetyResponse(kind)
  assert.match(response.body, /do not blindly replace a deep squat with another deep-squat variation/i)
  assert.match(response.body, /preserves the programmed movement role/i)
  assert.match(response.body, /not a diagnosis|cannot diagnose/i)
})

test('knee limitation has materially different guidance', () => {
  const hip = coachSafetyResponse(classifyCoachSafetyContext('hip pinching in deep squats'))
  const kind = classifyCoachSafetyContext('Knee pain aggravated by loaded knee flexion and deep knee flexion.')
  assert.equal(kind, 'knee-limitation')
  const knee = coachSafetyResponse(kind)
  assert.notEqual(knee.body, hip.body)
  assert.match(knee.body, /painful loaded or deep knee-flexion demand/i)
  assert.match(knee.body, /substitution provenance/i)
})

test('normal training questions are not intercepted', () => {
  assert.equal(classifyCoachSafetyContext('Can I increase the weight today?'), null)
  assert.equal(coachSafetyResponse(null), null)
})
