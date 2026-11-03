import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand, parseYear, sceneForYear } from '../src/voice/parse.ts'

const film = { asking: false, inFilm: true }
const ask = { asking: true, inFilm: false }

test('years: digits and words', () => {
  assert.equal(parseYear('2014'), 2014)
  assert.equal(parseYear('twenty twenty six'), 2026)
  assert.equal(parseYear('twenty fourteen'), 2014)
  assert.equal(parseYear('twenty fifteen'), 2015)
  assert.equal(parseYear('two thousand twenty three'), 2023)
  assert.equal(parseYear('two thousand and twenty four'), 2024)
  assert.equal(parseYear('twenty thirty'), 2030)
  assert.equal(parseYear('take me to 2015'), 2015)
  assert.equal(parseYear('hello there'), null)
})
test('years map to the scene covering them', () => {
  assert.equal(sceneForYear(2014), 1); assert.equal(sceneForYear(2015), 1); assert.equal(sceneForYear(2023), 2)
  assert.equal(sceneForYear(2024), 3); assert.equal(sceneForYear(2025), 3); assert.equal(sceneForYear(2026), 4); assert.equal(sceneForYear(2030), 5)
})
test('year command', () => {
  assert.deepEqual(parseCommand('twenty twenty six', film), { type: 'year', year: 2026, scene: 4 })
  assert.deepEqual(parseCommand('2015', film), { type: 'year', year: 2015, scene: 1 })
})
test('film commands', () => {
  assert.deepEqual(parseCommand('skip', film), { type: 'next' })
  assert.deepEqual(parseCommand('Next.', film), { type: 'next' })
  assert.deepEqual(parseCommand('go back', film), { type: 'prev' })
  assert.deepEqual(parseCommand('previous', film), { type: 'prev' })
  assert.deepEqual(parseCommand('pause', film), { type: 'pause' })
  assert.deepEqual(parseCommand('continue', film), { type: 'play' })
  assert.deepEqual(parseCommand('start over', film), { type: 'replay' })
  assert.deepEqual(parseCommand('replay', film), { type: 'replay' })
  assert.deepEqual(parseCommand('contact', film), { type: 'contact' })
  assert.deepEqual(parseCommand('show me', film), { type: 'showme' })
})
test('yes and no only while the popup is open', () => {
  assert.deepEqual(parseCommand("yes, let's go", ask), { type: 'yes' })
  assert.deepEqual(parseCommand('sure', ask), { type: 'yes' })
  assert.deepEqual(parseCommand('okay', ask), { type: 'yes' })
  assert.deepEqual(parseCommand('not now', ask), { type: 'no' })
  assert.deepEqual(parseCommand('later', ask), { type: 'no' })
  assert.equal(parseCommand('yes', film), null)
  assert.equal(parseCommand('pause', ask), null)
})
test("the avatar's own sentences never trigger commands (echo safety)", () => {
  for (const s of ["Hold on. We're going back.", "So the logic didn't start with code. It started right here.", "Next stop: Uttarkashi", "First stop: Uttarkashi. A small town between big mountains, and a kid with far too many questions.", 'Great. Stay close to the platform.', "Class 10: 93%. Then I went up into the mountains I grew up under.", 'Mission complete. We are back in 2026.', 'back in time with me through my childhood']) {
    assert.equal(parseCommand(s, film), null, s)
  }
})
test('noise', () => { assert.equal(parseCommand('', film), null); assert.equal(parseCommand('um', film), null) })
