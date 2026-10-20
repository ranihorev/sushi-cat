import { useState } from 'react';
import { CAT_CLIPS, UI_CLIPS, audio, clipsForLetter } from '../game/audio';
import type { Letter } from '../game/letters';
import { ALL_LETTERS, LETTERS } from '../game/letters';
import {
  NEEDED,
  WINDOW,
  blankProfile,
  isSolid,
  lettersSolid,
  recentScore,
  statFor,
  unlockAllLetters,
  withNameLetters,
} from '../game/store';
import type { Profile } from '../game/types';

interface Props {
  profile: Profile;
  onProfileChange: (updater: (p: Profile) => Profile) => void;
  onClose: () => void;
}

const barColor = (solid: boolean, seen: number) => {
  if (seen === 0) return '#E6DCD6';
  if (solid) return '#8FC46B';
  return '#F7C744';
};

export function Parent({ profile, onProfileChange, onClose }: Props) {
  const [name, setName] = useState(profile.name);
  /* Typed as text and settled when the box loses focus. Clamping on every key
     turned the "1" of "12" into 4 before the "2" could arrive. */
  const [meals, setMeals] = useState(String(profile.settings.roundsPerMeal));
  const commitMeals = () => {
    const n = Math.round(Number(meals));
    const next = Number.isFinite(n) && n > 0 ? Math.max(4, Math.min(16, n)) : 8;
    setMeals(String(next));
    onProfileChange((p) => ({ ...p, settings: { ...p.settings, roundsPerMeal: next } }));
  };

  const toggle = (l: Letter) =>
    onProfileChange((p) => {
      const on = p.activeSet.includes(l);
      const next = on ? p.activeSet.filter((x) => x !== l) : [...p.activeSet, l];
      return { ...p, activeSet: next.length >= 2 ? next : p.activeSet };
    });

  const solid = profile.activeSet.filter((l) => isSolid(profile, l)).length;
  const alphabetSolid = lettersSolid(profile);

  return (
    <div className="h-full w-full overflow-y-auto bg-cream px-5 py-6 text-ink">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-berry">Progress</h2>
            <p className="text-sm text-ink/60">
              {profile.mealsCompleted} meals · {solid}/{profile.activeSet.length} of the current
              set solid · level {profile.level} · {profile.dayStreak}-day streak
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 w-44 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-[#8FC46B] transition-all"
                  style={{ width: `${(alphabetSolid / 26) * 100}%` }}
                />
              </div>
              <span className="text-xs text-ink/55">
                {alphabetSolid}/26 of the alphabet · {profile.activeSet.length} introduced
              </span>
            </div>
          </div>
          <button
            type="button"
            onPointerDown={onClose}
            className="big-btn rounded-full bg-tamago px-7 py-2.5 text-lg text-ink"
          >
            Done
          </button>
        </header>

        <section className="mb-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold tracking-wide text-ink/60 uppercase">
              Letters — tap to add or remove from the active set
            </h3>
            <button
              type="button"
              onClick={() => onProfileChange(unlockAllLetters)}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-ink/75"
            >
              Introduce all 26 now
            </button>
          </div>
          <p className="mb-2 text-xs text-ink/50">
            A letter counts as solid once he's had it {WINDOW} times and got {NEEDED} of those
            right first try. New letters unlock on their own, 2–3 at a time, once most of the
            current set is solid. Only override that if he's clearly bored.
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
            {ALL_LETTERS.map((l) => {
              const s = statFor(profile, l);
              const active = profile.activeSet.includes(l);
              const right = s.recent.filter(Boolean).length;
              const pct = Math.round(recentScore(profile, l) * 100);
              return (
                /* A card, not one button with another inside it: a button in a
                   button is invalid, and the inner press reached the outer one. */
                <div
                  key={l}
                  className={`rounded-xl border-2 p-2 text-left transition-colors ${
                    active ? 'border-berry/50 bg-white shadow-[0_3px_0_rgba(59,42,58,0.12)]' : 'border-transparent bg-white/50 opacity-50'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(l)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-extrabold">{l}</span>
                      <span className="text-xs text-ink/55">{LETTERS[l].sound}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: barColor(isSolid(profile, l), s.seen) }}
                      />
                    </div>
                  </button>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-ink/55">
                    <span title={`${s.correct} of ${s.seen} all time`}>
                      {right}/{s.recent.length} recent
                    </span>
                    <button
                      type="button"
                      aria-label={`hear ${l}`}
                      onClick={() => {
                        audio.unlock();
                        void audio.speak([`prompt/${l}`, 400, `confirm/${l}`]);
                      }}
                      className="rounded px-1 text-berry"
                    >
                      ▶︎
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-8 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-ink/70">Child's name</span>
            <p className="mb-2 text-xs text-ink/50">
              His own letters get added to the active set — personal relevance beats optimal
              ordering at this age.
            </p>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tom"
                className="min-w-0 flex-1 rounded-lg border-2 border-ink/10 bg-white px-3 py-2 font-bold outline-none placeholder:text-ink/30"
              />
              <button
                type="button"
                onClick={() => onProfileChange((p) => withNameLetters(p, name))}
                className="rounded-lg bg-mint px-4 py-2 font-bold text-white"
              >
                Add
              </button>
            </div>
          </label>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 shadow-[0_2px_0_rgba(59,42,58,0.1)]">
              <span className="text-sm">
                <span className="font-bold">Wait for the prompt</span>
                <br />
                <span className="text-xs text-ink/55">
                  Hide the sushi until the sound has finished — use if he taps at random.
                </span>
              </span>
              <input
                type="checkbox"
                checked={profile.settings.gateChoices}
                onChange={(e) =>
                  onProfileChange((p) => ({
                    ...p,
                    settings: { ...p.settings, gateChoices: e.target.checked },
                  }))
                }
                className="h-6 w-6 shrink-0 accent-tamago"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 shadow-[0_2px_0_rgba(59,42,58,0.1)]">
              <span className="text-sm font-bold">Pieces per meal</span>
              <input
                type="number"
                inputMode="numeric"
                min={4}
                max={16}
                value={meals}
                onChange={(e) => setMeals(e.target.value)}
                onBlur={commitMeals}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-20 rounded-lg border-2 border-ink/10 bg-white px-3 py-2 text-center font-bold outline-none"
              />
            </label>
          </div>
        </section>

        <section className="mb-10">
          <h3 className="mb-2 text-sm font-bold tracking-wide text-ink/60 uppercase">
            Mix-ups he makes
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(profile.confusions).flatMap(([target, row]) =>
              Object.entries(row ?? {})
                .filter(([, n]) => (n ?? 0) >= 2)
                .map(([tapped, n]) => (
                  <span
                    key={`${target}-${tapped}`}
                    className="rounded-lg bg-white px-3 py-1.5 text-sm shadow-[0_2px_0_rgba(59,42,58,0.1)]"
                  >
                    <b>{target}</b> → {tapped} <span className="text-ink/55">×{n}</span>
                  </span>
                )),
            )}
            {!Object.values(profile.confusions).some((row) =>
              Object.values(row ?? {}).some((n) => (n ?? 0) >= 2),
            ) && (
              <span className="text-sm text-ink/50">Nothing yet.</span>
            )}
          </div>
        </section>

        <section className="flex flex-wrap gap-3 border-t border-ink/10 pt-5">
          <button
            type="button"
            onClick={() =>
              void audio.preload([
                ...ALL_LETTERS.flatMap(clipsForLetter),
                ...UI_CLIPS,
                ...CAT_CLIPS,
              ])
            }
            className="rounded-lg bg-white px-4 py-2 text-sm font-bold"
          >
            Cache all audio for offline
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Erase all progress and start over?')) {
                onProfileChange(() => blankProfile());
                setName('');
                setMeals('8');
              }
            }}
            className="rounded-lg bg-red-100 px-4 py-2 text-sm font-bold text-red-600"
          >
            Reset progress
          </button>
        </section>
      </div>
    </div>
  );
}
