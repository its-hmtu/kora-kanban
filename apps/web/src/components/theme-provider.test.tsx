import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from './theme-provider';

type Listener = (event: { matches: boolean }) => void;

/** Controllable `prefers-color-scheme` stub for jsdom (which has no matchMedia). */
function stubSystemTheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: dark)' && dark;
    },
    media: query,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  }));
  return {
    set(next: boolean) {
      dark = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setTheme('system')}>system</button>
    </div>
  );
}

const isDark = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});
afterEach(() => vi.unstubAllGlobals());

describe('ThemeProvider', () => {
  it('defaults to system and follows prefers-color-scheme', () => {
    stubSystemTheme(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(isDark()).toBe(true);
  });

  it('toggles the .dark class on <html> and persists the choice', () => {
    stubSystemTheme(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(isDark()).toBe(false);

    fireEvent.click(screen.getByText('dark'));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(THEME_STORAGE_KEY).toBe('kora-theme');

    fireEvent.click(screen.getByText('light'));
    expect(isDark()).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restores the persisted theme on mount', () => {
    stubSystemTheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(isDark()).toBe(true);
  });

  it('ignores an invalid persisted value', () => {
    stubSystemTheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
  });

  it('follows system changes live only while the theme is system', () => {
    const system = stubSystemTheme(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => system.set(true));
    expect(isDark()).toBe(true);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');

    fireEvent.click(screen.getByText('light'));
    act(() => system.set(true));
    expect(isDark()).toBe(false);
    expect(system.listenerCount()).toBe(0);

    fireEvent.click(screen.getByText('system'));
    expect(isDark()).toBe(true);
    act(() => system.set(false));
    expect(isDark()).toBe(false);
  });

  it('throws when useTheme is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
  });
});
