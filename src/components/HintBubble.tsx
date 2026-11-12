import type { Letter } from '../game/letters';
import { LETTERS } from '../game/letters';
import { Picture } from './Picture';

interface Props {
  letter: Letter;
  /** written above the picture — only when the letter is not the question */
  glyph?: string | null;
  /** bigger, for the first time he meets a letter */
  big?: boolean;
  className?: string;
}

/**
 * A picture in a bubble: the sun for S, the ball for B.
 *
 * It never shows the word in writing. He cannot read it yet, and a child who
 * could would be handed the answer. When the letter is shown with it — meeting
 * a new letter, or being told which piece he picked — the two sit together so
 * the shape, the sound and the thing become one memory.
 */
export function HintBubble({ letter, glyph, big, className }: Props) {
  return (
    <div
      data-hint={letter}
      className={`cat-pop pointer-events-none flex flex-col items-center justify-center rounded-[28%] border-4 border-white bg-rice/95 shadow-[0_6px_0_rgba(0,0,0,0.22)] ${
        big ? 'gap-0.5 p-2' : 'p-[clamp(5px,1.2vmin,10px)]'
      } ${className ?? ''}`}
    >
      {glyph && (
        <span
          className="font-extrabold leading-none text-nori"
          style={{ fontSize: big ? 'clamp(30px, 7.5vmin, 68px)' : 'clamp(20px, 4.5vmin, 40px)' }}
        >
          {glyph}
        </span>
      )}
      <Picture name={LETTERS[letter].word} className={glyph ? 'h-[52%] w-[70%]' : 'h-full w-full'} />
    </div>
  );
}
