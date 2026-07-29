/* Letter data: the phonics source of truth.
   `arpa` drives ElevenLabs generation (scripts/generate-audio.mjs).
   `sound` is the human-readable phoneme, shown only on the parent screen. */

export type Letter =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

export type Topping =
  | 'salmon' | 'tuna' | 'tamago' | 'ebi' | 'avocado' | 'ika' | 'unagi' | 'roe';

export interface LetterInfo {
  /** phoneme, written for the parent screen — clipped, no trailing schwa */
  sound: string;
  /** CMU arpabet for TTS generation; repeated symbols = held continuant */
  arpa: string;
  /** a word a 4-year-old already knows, starting with this sound */
  word: string;
  topping: Topping;
}

export const LETTERS: Record<Letter, LetterInfo> = {
  /* toppings are assigned so that letters unlocked together never share one —
     colour becomes a second, independent cue while he learns the shapes */
  A: { sound: '/a/',  arpa: 'AE1',     word: 'apple',    topping: 'ika' },
  B: { sound: '/b/',  arpa: 'B',       word: 'ball',     topping: 'unagi' },
  C: { sound: '/k/',  arpa: 'K',       word: 'cat',      topping: 'avocado' },
  D: { sound: '/d/',  arpa: 'D',       word: 'dog',      topping: 'unagi' },
  E: { sound: '/e/',  arpa: 'EH1',     word: 'egg',      topping: 'tamago' },
  F: { sound: '/f/',  arpa: 'F F F',   word: 'fish',     topping: 'roe' },
  G: { sound: '/g/',  arpa: 'G',       word: 'goat',     topping: 'avocado' },
  H: { sound: '/h/',  arpa: 'HH HH',   word: 'hat',      topping: 'roe' },
  I: { sound: '/i/',  arpa: 'IH1',     word: 'igloo',    topping: 'ika' },
  J: { sound: '/j/',  arpa: 'JH',      word: 'jam',      topping: 'roe' },
  K: { sound: '/k/',  arpa: 'K',       word: 'kite',     topping: 'tuna' },
  L: { sound: '/l/',  arpa: 'L L',     word: 'lion',     topping: 'tamago' },
  M: { sound: '/m/',  arpa: 'M M M',   word: 'moon',     topping: 'tuna' },
  N: { sound: '/n/',  arpa: 'N N N',   word: 'nose',     topping: 'salmon' },
  O: { sound: '/o/',  arpa: 'AA1',     word: 'octopus',  topping: 'ebi' },
  P: { sound: '/p/',  arpa: 'P',       word: 'pizza',    topping: 'ebi' },
  Q: { sound: '/kw/', arpa: 'K W',     word: 'queen',    topping: 'avocado' },
  R: { sound: '/r/',  arpa: 'R R',     word: 'rocket',   topping: 'tuna' },
  S: { sound: '/s/',  arpa: 'S S S',   word: 'sun',      topping: 'salmon' },
  T: { sound: '/t/',  arpa: 'T',       word: 'tiger',    topping: 'tamago' },
  U: { sound: '/u/',  arpa: 'AH1',     word: 'umbrella', topping: 'salmon' },
  V: { sound: '/v/',  arpa: 'V V V',   word: 'van',      topping: 'ebi' },
  W: { sound: '/w/',  arpa: 'W AH0',   word: 'water',    topping: 'avocado' },
  X: { sound: '/ks/', arpa: 'K S S',   word: 'box',      topping: 'ika' },
  Y: { sound: '/y/',  arpa: 'Y AH0',   word: 'yo-yo',    topping: 'tamago' },
  Z: { sound: '/z/',  arpa: 'Z Z Z',   word: 'zebra',    topping: 'unagi' },
};

export const ALL_LETTERS = Object.keys(LETTERS) as Letter[];

/** Letters that share the same phoneme — never show both as choices in one round. */
export const HOMOPHONES: Letter[][] = [
  ['C', 'K'],
];

/** Visually confusable uppercase shapes — held back until level 3. */
const LOOKALIKE_GROUPS: Letter[][] = [
  ['M', 'N', 'W'],
  ['E', 'F'],
  ['P', 'R', 'B'],
  ['O', 'Q', 'C', 'G'],
  ['I', 'T', 'L', 'J'],
  ['U', 'V', 'Y'],
  ['K', 'X'],
  ['C', 'S'],
  ['P', 'A'],
  ['D', 'O'],
  ['S', 'Z'],
];

const lookalikeIndex = (() => {
  const m = new Map<Letter, Set<Letter>>();
  for (const group of LOOKALIKE_GROUPS) {
    for (const a of group) {
      if (!m.has(a)) m.set(a, new Set());
      for (const b of group) if (a !== b) m.get(a)!.add(b);
    }
  }
  return m;
})();

export function looksAlike(a: Letter, b: Letter): boolean {
  return a !== b && (lookalikeIndex.get(a)?.has(b) ?? false);
}

export function soundsAlike(a: Letter, b: Letter): boolean {
  return a !== b && HOMOPHONES.some((g) => g.includes(a) && g.includes(b));
}

/* Progression: batches of 2–3, unlocked only once the current set is solid.
   The starter set is distinct sounds, easy mouths, high frequency. */
export const STARTER_SET: Letter[] = ['S', 'M', 'T', 'A', 'P', 'C'];

export const BATCHES: Letter[][] = [
  ['B', 'F', 'N'],
  ['R', 'O', 'G'],
  ['D', 'H', 'L'],
  ['I', 'E', 'U'],
  ['J', 'K', 'W'],
  ['V', 'Y', 'Z'],
  ['Q', 'X'],
];

export const TOPPING_COLORS: Record<Topping, { fill: string; shade: string }> = {
  salmon:   { fill: '#FF8A65', shade: '#E5674A' },
  tuna:     { fill: '#E4574F', shade: '#C13F3E' },
  tamago:   { fill: '#F7C744', shade: '#DFA92B' },
  ebi:      { fill: '#FFB199', shade: '#E58B72' },
  avocado:  { fill: '#8FC46B', shade: '#6FA34D' },
  ika:      { fill: '#E4D3B4', shade: '#BFA681' },
  unagi:    { fill: '#B0703C', shade: '#8E5527' },
  roe:      { fill: '#FF9F43', shade: '#E07C1F' },
};
