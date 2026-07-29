import { useCallback, useEffect, useRef, useState } from 'react';
import { DECORATIONS } from './components/Restaurant';
import { UI_CLIPS, audio, clipsForLetter } from './game/audio';
import type { Letter } from './game/letters';
import { ALL_LETTERS } from './game/letters';
import { loadProfile, maybeUnlockBatch, noteSession, saveProfile } from './game/store';
import type { Profile } from './game/types';
import { Parent } from './screens/Parent';
import { Play } from './screens/Play';
import { Rest } from './screens/Rest';
import { Title } from './screens/Title';

type Screen = 'title' | 'play' | 'rest' | 'parent';

export default function App() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [screen, setScreen] = useState<Screen>('title');
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

  // keep the tablet awake while he plays
  useEffect(() => {
    const nav = navigator as any;
    if (screen === 'play' && nav.wakeLock) {
      nav.wakeLock.request('screen').then(
        (l: any) => (wakeLock.current = l),
        () => {},
      );
    }
    return () => {
      wakeLock.current?.release?.();
      wakeLock.current = null;
    };
  }, [screen]);

  const start = useCallback(() => {
    audio.unlock();
    void audio.preload([
      ...profile.activeSet.flatMap(clipsForLetter),
      ...UI_CLIPS,
    ]);
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

      {screen === 'play' && (
        <Play
          key={profile.mealsCompleted}
          profile={profile}
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
          onAgain={start}
          onHome={() => setScreen('title')}
        />
      )}

      {screen === 'parent' && (
        <Parent profile={profile} onProfileChange={update} onClose={() => setScreen('title')} />
      )}
    </div>
  );
}
