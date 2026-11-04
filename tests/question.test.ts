import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeQuestion, isEcho } from '../src/voice/question.ts'

test('questions for Alok are recognised', () => {
  for (const q of ['what is your biggest setback', 'tell me about yourself', 'why do you want to join wispr flow', 'how does bug slayer work', 'can you tell me about ringo', 'who are you', 'what do you do outside coding', 'are you real', 'explain bug slayer']) assert.equal(looksLikeQuestion(q), true, q)
})
test('commands, filler and statements are not questions', () => {
  for (const q of ['pause', 'yes', 'okay', 'next scene', 'that is nice', 'i like this', 'two thousand twenty six', 'stop']) assert.equal(looksLikeQuestion(q), false, q)
})
test('echo of his own voice is ignored', () => {
  const said = ["Hello, and welcome to my lab. I'm Alok Chauhan, or at least the digital version of him.", 'Would you like to travel back in time with me, through my childhood, my wins and the things I built?']
  assert.equal(isEcho('would you like to travel back in time with me', said), true)
  assert.equal(isEcho('welcome to my lab I am alok chauhan', said), true)
  assert.equal(isEcho('what is your biggest setback', said), false)
})

import { wakePhrase } from '../src/voice/question.ts'
test('the wake phrase is recognised and the rest is returned', () => {
  assert.equal(wakePhrase('hey alok listen'), '')
  assert.equal(wakePhrase('Hey Alok, listen!'), '')
  assert.equal(wakePhrase('hey a lock listen'), '')
  assert.equal(wakePhrase('ok alok'), '')
  assert.equal(wakePhrase('alok are you there'), '')
  assert.equal(wakePhrase('hey alok what is your biggest setback'), 'what is your biggest setback')
  assert.equal(wakePhrase('hey alok listen why do you want to join wispr flow'), 'why do you want to join wispr flow')
})
test('ordinary speech and his own narration do not wake him', () => {
  for (const t of ['alok chauhan first year computer science', 'hello and welcome to my lab', 'what is your biggest setback', 'i am alok', 'pause']) assert.equal(wakePhrase(t), null, t)
})

test('more ways to interrupt him, but never his own words', () => {
  assert.equal(wakePhrase('excuse me alok'), '')
  assert.equal(wakePhrase('wait alok'), '')
  assert.equal(wakePhrase('alok hold on'), '')
  assert.equal(wakePhrase('alok i have a question'), '')
  assert.equal(wakePhrase('i have a question'), '')
  assert.equal(wakePhrase('i have a question what is your favourite project'), 'what is your favourite project')
  assert.equal(wakePhrase('hold on we are going back'), null)         // his own line
  assert.equal(wakePhrase('stop'), null)
  assert.equal(wakePhrase('wait'), null)
})
