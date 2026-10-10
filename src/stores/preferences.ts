import { atom } from 'nanostores';
export type Theme = 'default' | 'terminal' | 'newspaper';
export type Mode = 'light' | 'dark' | 'system';
export const themeStore = atom<Theme>('default');
export const colorModeStore = atom<Mode>('system');
export const motionStore = atom<boolean>(true);
