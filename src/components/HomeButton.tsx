interface Props {
  onHome: () => void;
}

/**
 * The way back to the title screen, in the corner of every game.
 *
 * This used to be an invisible long-press, so that he could not leave by
 * accident. In practice nobody could find it, the parent included. Going back
 * to the title costs him nothing — the meal just starts again — so it is a
 * plain, visible button now.
 */
export function HomeButton({ onHome }: Props) {
  return (
    <button
      type="button"
      aria-label="home"
      onPointerDown={onHome}
      className="absolute top-3 left-3 z-50 grid h-[clamp(44px,6.5vh,60px)] w-[clamp(44px,6.5vh,60px)] place-items-center rounded-full bg-black/30 active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2">
        <path
          d="M 3.5 11.5 L 12 4 L 20.5 11.5 M 6 9.5 V 20 H 18 V 9.5"
          fill="none"
          stroke="#FFFBF2"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M 10 20 V 14.5 H 14 V 20" fill="none" stroke="#FFFBF2" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
