import type { Reaction } from '../components/Cat';
import { audio } from './audio';
import type { Gag } from './surprises';

/** Which noise goes with which reaction. The animation is the joke; this is the
    punchline arriving at the same moment. */
export const REACTION_SOUND: Record<Reaction, () => void> = {
  hiccup: () => audio.hiccup(),
  burp: () => audio.burp(),
  spicy: () => audio.steam(),
  balloon: () => audio.inflate(),
  sleepy: () => audio.purr(),
  hearts: () => audio.twinkle(),
  stars: () => audio.twinkle(),
  dizzy: () => audio.dizzy(),
  bubble: () => audio.bubble(),
  gulp: () => audio.gulp(),
  fishbone: () => audio.sparkle(),
  lick: () => audio.lick(),
  dance: () => audio.dance(),
  huge: () => audio.boing(),
  sneeze: () => audio.sneeze(),
  float: () => audio.twinkle(),
};


/** The noise for each joke. The splat is the one line Emma says: the silly
    word first, and the flop on the floor as he lands. */
export const GAG_SOUND: Record<Gag, () => void> = {
  achoo: () => audio.achoo(),
  wasabi: () => audio.kettle(),
  splat: () => {
    void audio.oneShot('fun/splat');
    window.setTimeout(() => audio.splat(), 520);
  },
  burp: () => audio.bigBurp(),
  wiggle: () => audio.wiggle(),
  yawn: () => void audio.oneShot('cat/yawn'),
};
