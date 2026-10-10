import { Moon, Sun } from '@/ui/icons';

import { useTheme } from '@/ui/theme';

import { Hint, IslandButton } from './island';

/** Switches between the light and the dark theme for the session. */
export function ThemeButton() {
  const theme = useTheme((state) => state.theme);
  const toggle = useTheme((state) => state.toggle);
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <Hint label={`Switch to the ${next} theme`} side="bottom">
      <IslandButton aria-label={`Switch to the ${next} theme`} onClick={toggle}>
        {theme === 'dark' ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
      </IslandButton>
    </Hint>
  );
}
