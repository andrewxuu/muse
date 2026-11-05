/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cream: v('cream'),
        surface: v('surface'),
        line: v('line'),
        track: v('track'),
        ink: v('ink'),
        muted: v('muted'),
        hint: v('hint'),
        art: v('art'),
        danger: v('danger'),
        teal: { DEFAULT: v('teal'), soft: v('teal-soft') },
        mood: {
          great: v('mood-great'),
          good: v('mood-good'),
          okay: v('mood-okay'),
          low: v('mood-low'),
          awful: v('mood-awful'),
        },
      },
      keyframes: {
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'sheet-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'tile-in': { from: { opacity: '0', transform: 'translateY(-8px) scale(0.85)' }, to: { opacity: '1', transform: 'none' } },
        'step-pulse': { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.2)' } },
      },
      animation: {
        'sheet-up': 'sheet-up 0.25s ease-out',
        'sheet-in': 'sheet-in 0.25s ease-out',
        'tile-in': 'tile-in 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) both',
        'step-pulse': 'step-pulse 1s ease-in-out infinite',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
