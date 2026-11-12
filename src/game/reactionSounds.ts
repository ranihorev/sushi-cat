import type { Reaction } from '../components/Cat';
import { audio } from './audio';

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

