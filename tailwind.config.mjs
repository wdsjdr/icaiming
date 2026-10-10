/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: 'var(--ink)', surface: 'var(--surface)', canvas: 'var(--bg)', accent: 'var(--accent)', muted: 'var(--muted)' },
      fontFamily: { sans: ['var(--font-body)'], display: ['var(--font-display)'], mono: ['var(--font-mono)'] },
    },
  },
};
