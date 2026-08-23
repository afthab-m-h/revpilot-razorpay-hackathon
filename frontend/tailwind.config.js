/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        accent: 'var(--accent)',
        accentSoft: 'var(--accent-soft)',
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        inkMute: 'var(--ink-mute)',
        line: 'var(--line)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        fadeUp: 'fadeUp .45s cubic-bezier(.16,1,.3,1) both',
        fadeIn: 'fadeIn .5s ease both',
      },
    },
  },
  plugins: [],
}
