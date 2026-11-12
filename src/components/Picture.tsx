import { memo } from 'react';

/* The pictures: one for every letter's clue word and one for every word he
   builds. They are how a sound gets something to hang on — "sss" is easier to
   keep when it comes with a sun.

   The drawings are Twemoji (CC-BY 4.0, see the README), plus an igloo and a jam
   jar drawn to match, which Twemoji does not have. They are files in the
   bundle, not the device's own emoji, so they look the same on every tablet
   and work offline. */

const files = import.meta.glob('../assets/pictures/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byName = new Map(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

export const hasPicture = (name: string) => byName.has(name);

interface Props {
  /** the word, as in letters.ts and words.ts: "sun", "yo-yo", "map" */
  name: string;
  className?: string;
}

function PictureImg({ name, className }: Props) {
  const src = byName.get(name);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      data-picture={name}
      draggable={false}
      className={`pointer-events-none select-none ${className ?? ''}`}
    />
  );
}

export const Picture = memo(PictureImg);
