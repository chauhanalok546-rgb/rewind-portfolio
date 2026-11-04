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
