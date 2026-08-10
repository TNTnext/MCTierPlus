/**
 * 明暗主题（微信风格）
 * - 三档：明亮 / 黑暗 / 跟随系统，默认黑暗
 * - 在根节点写入 data-weui-theme="light|dark"，与 WeUI 规范一致
 */
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_MODE_KEY = 'mctier_theme_mode';
export const THEME_MODE_EVENT = 'mctier-theme-mode';

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_MODE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function getSystemDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? (getSystemDark() ? 'dark' : 'light') : mode;
}

/** 将主题写入根节点，返回实际生效的主题 */
export function applyThemeMode(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-weui-theme', resolved);
  return resolved;
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyThemeMode(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_MODE_EVENT, { detail: mode }));
}

/** 跟随系统时订阅系统主题变化 */
export function subscribeSystemTheme(cb: () => void): () => void {
  if (!window.matchMedia) return () => undefined;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => cb();
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
