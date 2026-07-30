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
  if (seen === 0) return '#3A4A44';
  if (solid) return '#8FC46B';
  return '#F7C744';
};

export function Parent({ profile, onProfileChange, onClose }: Props) {
  const [name, setName] = useState(profile.name);

  const toggle = (l: Letter) =>
    onProfileChange((p) => {
      const on = p.activeSet.includes(l);
      const next = on ? p.activeSet.filter((x) => x !== l) : [...p.activeSet, l];
      return { ...p, activeSet: next.length >= 2 ? next : p.activeSet };
    });

  const solid = profile.activeSet.filter((l) => isSolid(profile, l)).length;
  const alphabetSolid = lettersSolid(profile);

  return (
    <div className="h-full w-full overflow-y-auto bg-nori-deep px-5 py-6 text-rice">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold">Progress</h2>
            <p className="text-sm text-white/50">
              {profile.mealsCompleted} meals · {solid}/{profile.activeSet.length} of the current
              set solid · level {profile.level} · {profile.dayStreak}-day streak
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 w-44 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#8FC46B] transition-all"
                  style={{ width: `${(alphabetSolid / 26) * 100}%` }}
                />
              </div>
              <span className="text-xs text-white/40">
                {alphabetSolid}/26 of the alphabet · {profile.activeSet.length} introduced
              </span>
            </div>
          </div>
          <button
            type="button"
            onPointerDown={onClose}
            className="rounded-full bg-tamago px-6 py-3 font-extrabold text-nori"
          >
            Done
          </button>
        </header>

        <section className="mb-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold tracking-wide text-white/50 uppercase">
              Letters — tap to add or remove from the active set
            </h3>
            <button
              type="button"
              onPointerDown={() => onProfileChange(unlockAllLetters)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70"
            >
              Introduce all 26 now
            </button>
          </div>
          <p className="mb-2 text-xs text-white/35">
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
                <button
                  key={l}
                  type="button"
                  onPointerDown={() => toggle(l)}
                  className={`rounded-xl border-2 p-2 text-left transition-colors ${
                    active ? 'border-white/25 bg-white/10' : 'border-transparent bg-white/[0.03] opacity-45'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold">{l}</span>
                    <span className="text-xs text-white/45">{LETTERS[l].sound}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: barColor(isSolid(profile, l), s.seen) }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-white/40">
                    <span title={`${s.correct} of ${s.seen} all time`}>
                      {right}/{s.recent.length} recent
                    </span>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        void audio.speak([`prompt/${l}`, 400, `confirm/${l}`]);
                      }}
                      className="rounded px-1 hover:text-white"
                    >
                      ▶︎
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-8 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-white/60">Child's name</span>
            <p className="mb-2 text-xs text-white/35">
              His own letters get added to the active set — personal relevance beats optimal
              ordering at this age.
            </p>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tom"
                className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 font-bold outline-none placeholder:text-white/25"
              />
              <button
                type="button"
                onPointerDown={() => onProfileChange((p) => withNameLetters(p, name))}
                className="rounded-lg bg-white/15 px-4 py-2 font-bold"
              >
                Add
              </button>
            </div>
          </label>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2.5">
              <span className="text-sm">
                <span className="font-bold">Wait for the prompt</span>
                <br />
                <span className="text-xs text-white/40">
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

            <label className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2.5">
              <span className="text-sm font-bold">Pieces per meal</span>
              <input
                type="number"
                min={4}
                max={16}
                value={profile.settings.roundsPerMeal}
                onChange={(e) =>
                  onProfileChange((p) => ({
                    ...p,
                    settings: {
                      ...p.settings,
                      roundsPerMeal: Math.max(4, Math.min(16, Number(e.target.value) || 8)),
                    },
                  }))
                }
                className="w-20 rounded-lg bg-white/10 px-3 py-2 text-center font-bold outline-none"
              />
            </label>
          </div>
        </section>

        <section className="mb-10">
          <h3 className="mb-2 text-sm font-bold tracking-wide text-white/50 uppercase">
            Mix-ups he makes
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(profile.confusions).flatMap(([target, row]) =>
              Object.entries(row ?? {})
                .filter(([, n]) => (n ?? 0) >= 2)
                .map(([tapped, n]) => (
                  <span
                    key={`${target}-${tapped}`}
                    className="rounded-lg bg-white/8 px-3 py-1.5 text-sm"
                  >
                    <b>{target}</b> → {tapped} <span className="text-white/40">×{n}</span>
                  </span>
                )),
            )}
            {Object.keys(profile.confusions).length === 0 && (
              <span className="text-sm text-white/35">Nothing yet.</span>
            )}
          </div>
        </section>

        <section className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
          <button
            type="button"
            onPointerDown={() =>
              void audio.preload([
                ...ALL_LETTERS.flatMap(clipsForLetter),
                ...UI_CLIPS,
                ...CAT_CLIPS,
              ])
            }
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold"
          >
            Cache all audio for offline
          </button>
          <button
            type="button"
            onPointerDown={() => {
              if (confirm('Erase all progress and start over?')) {
                onProfileChange(() => blankProfile());
              }
            }}
            className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-bold text-red-300"
          >
            Reset progress
          </button>
        </section>
      </div>
    </div>
  );
}
