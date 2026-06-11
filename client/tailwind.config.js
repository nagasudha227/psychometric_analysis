/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'fts-bg': '#0a0d14',
        'fts-panel': '#0f1824',
        'fts-card': '#131f2e',
        'fts-border': '#1e3a5f',
        'fts-cyan': '#00d4d4',
        'fts-cyan-dark': '#00a8a8',
        'fts-amber': '#f59e0b',
        'fts-green': '#22c55e',
        'fts-red': '#ef4444',
      },
      fontFamily: {
        mono: ['"Courier New"', 'Courier', 'monospace'],
        sans: ['"Trebuchet MS"', 'Arial', 'sans-serif'],
      },
      letterSpacing: {
        'widest2': '0.3em',
        'widest3': '0.4em',
      }
    },
  },
  plugins: [],
}
