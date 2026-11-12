import type { Profile, WearSlot } from './types';

/* Presents. After a meal he is offered two and keeps one. The other goes back
   in the pile, so there is always a reason to finish another meal — and what
   the cat ends up wearing is his doing, not the game's.

   Things to wear go on the cat, one per place. Toys sit on the counter of the
   title screen and do something when he touches them. The drawings are in
   components/Wear.tsx; this file is only what exists and who has it. */

export interface Gift {
  id: string;
  slot: WearSlot | 'toy';
}

export const GIFTS: Gift[] = [
  { id: 'bow', slot: 'ear' },
  { id: 'party-hat', slot: 'head' },
  { id: 'yarn', slot: 'toy' },
  { id: 'sunglasses', slot: 'face' },
  { id: 'bow-tie', slot: 'neck' },
  { id: 'crown', slot: 'head' },
  { id: 'flower', slot: 'ear' },
  { id: 'fish-toy', slot: 'toy' },
  { id: 'bell', slot: 'neck' },
  { id: 'heart-glasses', slot: 'face' },
  { id: 'top-hat', slot: 'head' },
  { id: 'scarf', slot: 'neck' },
];

export const giftById = (id: string) => GIFTS.find((g) => g.id === id);

const owned = (p: Profile) => p.gifts ?? [];

/** Two presents he does not have yet — or one, or none, as the pile runs out. */
export function offerGifts(p: Profile): Gift[] {
  const left = GIFTS.filter((g) => !owned(p).includes(g.id));
  if (left.length <= 2) return left;
  /* The first is the next in the list, so the early presents are the ones that
     show best on the cat; the second is a surprise from further down. */
  const second = left[1 + Math.floor(Math.random() * (left.length - 1))];
  return Math.random() < 0.5 ? [left[0], second] : [second, left[0]];
}

/** He keeps it, and if it can be worn the cat puts it on at once. */
export function takeGift(p: Profile, id: string): Profile {
  const gift = giftById(id);
  if (!gift || owned(p).includes(id)) return p;
  const next = { ...p, gifts: [...owned(p), id] };
  return gift.slot === 'toy' ? next : { ...next, wearing: { ...p.wearing, [gift.slot]: id } };
}

/** On if it was off, off if it was on; putting one on takes off what was there. */
export function toggleWear(p: Profile, id: string): Profile {
  const gift = giftById(id);
  if (!gift || gift.slot === 'toy' || !owned(p).includes(id)) return p;
  const wearing = { ...p.wearing };
  if (wearing[gift.slot] === id) delete wearing[gift.slot];
  else wearing[gift.slot] = id;
  return { ...p, wearing };
}

export const wornBy = (p: Profile): string[] => Object.values(p.wearing ?? {}).filter(Boolean) as string[];
