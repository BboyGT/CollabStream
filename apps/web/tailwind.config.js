/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        zinc: {
          975: '#09090b',
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fade-in 0.3s ease forwards',
        'slide-up': 'slide-up 0.25s ease forwards',
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(239,68,68,0)' },
        },
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        'slide-up': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
