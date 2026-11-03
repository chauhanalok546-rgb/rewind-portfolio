/** Turns a spoken phrase into a command. Pure functions (no browser APIs) so they can be tested.
 *  Matching is strict on purpose: only short, whole utterances count, so the avatar's own long sentences
 *  (for example "Hold on. We're going back.") can never trigger a command by echo. */
export type Command =
  | { type: 'yes' } | { type: 'no' } | { type: 'pause' } | { type: 'play' } | { type: 'next' } | { type: 'prev' }
  | { type: 'replay' } | { type: 'contact' } | { type: 'showme' } | { type: 'year'; year: number; scene: number }

export interface ParseContext { asking: boolean; inFilm: boolean }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()

const YES = ['yes', 'yeah', 'yep', 'yup', 'sure', 'okay', 'ok', "let's go", 'lets go', 'yes lets go', "yes let's go", 'yes please', 'go', 'alright', 'do it', 'absolutely', 'of course', 'please']
const NO = ['no', 'nope', 'not now', 'later', 'no thanks', 'no thank you', 'maybe later', 'not yet', 'nah']
const PAUSE = ['pause', 'stop', 'freeze']
const PLAY = ['play', 'continue', 'resume', 'go on', 'keep going', 'carry on']
const NEXT = ['next', 'skip', 'skip this', 'next scene', 'forward', 'move on', 'skip scene']
const PREV = ['back', 'go back', 'previous', 'previous scene', 'last scene', 'before']
const REPLAY = ['replay', 'start over', 'restart', 'again', 'play again', 'from the start', 'from the beginning']
const CONTACT = ['contact', 'contact me', 'contact details', 'how can i contact you', 'end card', 'contacts']
const SHOWME = ['show me', 'decode', 'decode it', 'decode the signal', 'show me the signal']

const ONES: Record<string, number> = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

/** words like "six", "twenty six", "fourteen", "oh five" -> number below 100, or null */
function smallNumber(tokens: string[]): number | null {
  if (!tokens.length) return null
  if (tokens.length === 1) { const t = tokens[0]; if (t in ONES) return ONES[t]; if (t in TENS) return TENS[t]; return null }
  if (tokens.length === 2) {
    if (tokens[0] in TENS && tokens[1] in ONES && ONES[tokens[1]] < 10) return TENS[tokens[0]] + ONES[tokens[1]]
    if ((tokens[0] === 'oh' || tokens[0] === 'zero') && tokens[1] in ONES && ONES[tokens[1]] < 10) return ONES[tokens[1]]
  }
  return null
}

/** "2015", "twenty twenty six", "twenty fourteen", "two thousand and twenty three" -> 2015, 2026, 2014, 2023 */
export function parseYear(text: string): number | null {
  const t = norm(text)
  const digits = /\b(19\d\d|20\d\d)\b/.exec(t)
  if (digits) return Number(digits[1])
  const tokens = t.split(' ').filter((w) => w !== 'and' && w !== 'the' && w !== 'year' && w !== 'in' && w !== 'to' && w !== 'go' && w !== 'take' && w !== 'me' && w !== 'show' && w !== 'jump')
  if (tokens[0] === 'two' && tokens[1] === 'thousand') { const rest = smallNumber(tokens.slice(2)); return rest === null && tokens.length === 2 ? 2000 : rest === null ? null : 2000 + rest }
  if (tokens[0] === 'twenty') { const rest = smallNumber(tokens.slice(1)); if (rest !== null && rest >= 0) return 2000 + rest }
  return null
}

/** which scene covers a year (matches the year chips: 2015, 2023, 2024, 2026, 2030) */
export function sceneForYear(y: number): number {
  if (y <= 2022) return 1
  if (y === 2023) return 2
  if (y <= 2025) return 3
  if (y === 2026) return 4
  return 5
}

const FILLER = new Set(['go', 'to', 'take', 'me', 'jump', 'show', 'in', 'the', 'year', 'and', 'please', 'scene', 'from', 'at', 'play', 'a', 'of'])
/** the year words/digits must be the point of the utterance, not part of a sentence ("we're back in 2026") */
const onlyYearAndFiller = (words: string[]) => words.every((w) => w in ONES || w in TENS || w === 'thousand' || /^\d+$/.test(w) || FILLER.has(w))

export function parseCommand(text: string, ctx: ParseContext): Command | null {
  const t = norm(text)
  if (!t) return null
  const words = t.split(' ')
  const year = words.length <= 8 && onlyYearAndFiller(words) ? parseYear(t) : null
  if (year !== null && year >= 1990 && year <= 2035 && !ctx.asking) return { type: 'year', year, scene: sceneForYear(year) }
  if (words.length > 4) return null                        // long sentences are never commands
  const is = (list: string[]) => list.includes(t)
  if (ctx.asking) { if (is(YES)) return { type: 'yes' }; if (is(NO)) return { type: 'no' }; return null }
  if (!ctx.inFilm) return null
  if (is(PAUSE)) return { type: 'pause' }
  if (is(PLAY)) return { type: 'play' }
  if (is(NEXT)) return { type: 'next' }
  if (is(PREV)) return { type: 'prev' }
  if (is(REPLAY)) return { type: 'replay' }
  if (is(CONTACT)) return { type: 'contact' }
  if (is(SHOWME)) return { type: 'showme' }
  return null
}
