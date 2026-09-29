import { useCallback, useEffect, useRef, useState } from 'react';
import { DECORATIONS } from './components/Restaurant';
import { CAT_CLIPS, UI_CLIPS, audio, clipsForLetter } from './game/audio';
import type { Letter } from './game/letters';
import { ALL_LETTERS } from './game/letters';
import { loadProfile, maybeUnlockBatch, noteSession, saveProfile } from './game/store';
import type { GameMode, Profile } from './game/types';
import { Cafe } from './screens/Cafe';
import { Parent } from './screens/Parent';
import { Play } from './screens/Play';
import { Rest } from './screens/Rest';
import { Title } from './screens/Title';

type Screen = 'title' | 'play' | 'rest' | 'parent';

export default function App() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [screen, setScreen] = useState<Screen>('title');
  const [mode, setMode] = useState<GameMode>('counter');
  const [eaten, setEaten] = useState<Letter[]>([]);
  const [newDecoration, setNewDecoration] = useState<string | null>(null);
  const [unlockedLetters, setUnlockedLetters] = useState<Letter[]>([]);
  const wakeLock = useRef<any>(null);

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const update = useCallback((updater: (p: Profile) => Profile) => {
    const next = updater(profileRef.current);
    profileRef.current = next;
    saveProfile(next);
    setProfile(next);
  }, []);

  /* Keep the tablet awake while he plays. The browser drops the lock whenever
     the page is hidden and never gives it back by itself, so it is asked for
     again each time he returns. A lock that arrives after he has already left
     the meal is let go at once rather than kept for good. */
  useEffect(() => {
    const nav = navigator as any;
    if (screen !== 'play' || !nav.wakeLock) return;
    let live = true;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock.request('screen').then(
        (l: any) => {
          if (live) wakeLock.current = l;
          else l.release?.();
        },
        () => {},
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', request);
      wakeLock.current?.release?.();
      wakeLock.current = null;
    };
  }, [screen]);

  /* Any touch anywhere wakes the sound up again. iPadOS suspends it when the
     screen locks or another app plays, and until now only the pieces and the
     replay button tried to resume it — and the pieces refuse touches while a
     round is waiting on a sound, which is exactly when it matters. */
  useEffect(() => {
    const wake = () => audio.unlock();
    window.addEventListener('pointerdown', wake, true);
    return () => window.removeEventListener('pointerdown', wake, true);
  }, []);

  const start = useCallback((m: GameMode) => {
    audio.unlock();
    setMode(m);
    void audio.preload([
      ...profile.activeSet.flatMap(clipsForLetter),
      ...UI_CLIPS,
      ...CAT_CLIPS,
    ]);
    // the greeting belongs to Play, which plays it in front of the first prompt
    // rather than under it
    audio.preloadIdle(ALL_LETTERS.flatMap(clipsForLetter));
    update(noteSession);
    setEaten([]);
    setScreen('play');
  }, [profile.activeSet, update]);

  const handleMealComplete = useCallback(
    (mealLetters: Letter[]) => {
      setEaten(mealLetters);

      let next: Profile = {
        ...profileRef.current,
        mealsCompleted: profileRef.current.mealsCompleted + 1,
      };

      // one new decoration per finished meal — the reason to come back tomorrow
      const locked = DECORATIONS.find((d) => !next.decorations.includes(d.id));
      if (locked) next = { ...next, decorations: [...next.decorations, locked.id] };
      setNewDecoration(locked?.id ?? null);

      const { profile: widened, unlocked } = maybeUnlockBatch(next);
      setUnlockedLetters(unlocked);
      if (unlocked.length) void audio.preload(unlocked.flatMap(clipsForLetter));

      update(() => widened);
      setScreen('rest');
    },
    [update],
  );

  return (
    <div className="h-full w-full">
      {screen === 'title' && (
        <Title profile={profile} onStart={start} onParent={() => setScreen('parent')} />
      )}

      {screen === 'play' && mode === 'cafe' && (
        <Cafe
          key={profile.mealsCompleted}
          profile={profile}
          onProfileChange={update}
          onMealComplete={handleMealComplete}
          onExit={() => setScreen('title')}
        />
      )}

      {screen === 'play' && mode !== 'cafe' && (
        <Play
          key={profile.mealsCompleted}
          profile={profile}
          mode={mode}
          onProfileChange={update}
          onMealComplete={handleMealComplete}
          onExit={() => setScreen('title')}
        />
      )}

      {screen === 'rest' && (
        <Rest
          profile={profile}
          eaten={eaten}
          newDecoration={newDecoration}
          unlockedLetters={unlockedLetters}
          onAgain={() => start(mode)}
          onHome={() => setScreen('title')}
        />
      )}

      {screen === 'parent' && (
        <Parent profile={profile} onProfileChange={update} onClose={() => setScreen('title')} />
      )}
    </div>
  );
}
