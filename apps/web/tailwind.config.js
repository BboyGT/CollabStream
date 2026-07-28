/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Redesign token system (see docs — collabstream-redesign.html
        // prototype). Reusing the EXISTING `mono`/`sans` keys rather than
        // inventing new class names: font-mono and font-sans are already
        // used throughout the app, so this swap applies everywhere
        // automatically. `display` is new — only Space Grotesk headings
        // need it explicitly as screens get redesigned.
        //
        // Worth knowing: Space Grotesk + JetBrains Mono were ALREADY
        // linked in index.html before this change, but this config still
        // pointed at "DM Mono"/"DM Sans" — fonts that were never actually
        // loaded anywhere. Every font-mono class in the app has been
        // silently falling back to a system font. This fixes that as a
        // side effect of adopting the redesign's font system.
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        zinc: {
          975: '#09090b',
        },
        // Redesign ink scale — background surfaces (900–650) plus the
        // three text tones (hi/lo/dim), all in one family. These are kept
        // together deliberately: Tailwind generates color utility classes
        // as `{property}-{colorPath}`, so nesting hi/lo/dim under a
        // separately-named `text` group would have produced redundant
        // `text-text-hi`-style classes instead of the clean `text-ink-hi`
        // this gives. Additive: doesn't touch Tailwind's built-in zinc/
        // slate/gray scales, which the app still uses in plenty of places
        // not yet migrated to the redesign.
        ink: {
          900: '#0B0D10',
          850: '#101318',
          800: '#14171C',
          700: '#1B1F26',
          650: '#20242C',
          hi: '#F2F4F7',
          lo: '#8B92A1',
          dim: '#5C626E',
        },
        line: {
          DEFAULT: '#262B33',
          soft: '#1D2129',
        },
        // Accent pairs. `amber` and `emerald` are already Tailwind color
        // names (amber-50..950, emerald-50..950) — extend merges rather
        // than replaces, so adding DEFAULT/dim here only ADDS `bg-amber`/
        // `bg-amber-dim` etc. alongside the existing numbered scale,
        // nothing is removed or broken for any existing amber-500-style
        // usage elsewhere in the app.
        amber: {
          DEFAULT: '#F5A623',
          dim: '#3A2E15',
        },
        // `coral` is new — this redesign's danger/leave color, replacing
        // red-500/red-600 on actions like "Leave" and "Kick" as those
        // screens get migrated. Not a Tailwind default name, so no merge
        // concerns.
        coral: {
          DEFAULT: '#FF5A5F',
          dim: '#3A1E1F',
        },
        emerald: {
          DEFAULT: '#34D399',
          dim: '#123328',
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fade-in 0.3s ease forwards',
        'slide-up': 'slide-up 0.25s ease forwards',
        // Redesign additions
        rise: 'rise 0.3s ease',
        blink: 'blink 1.6s ease infinite',
        'baton-pass': 'baton-pass 0.5s ease',
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
        // Redesign additions — rise (screen-enter, from the prototype's
        // .screen.active animation), blink (LIVE status-dot pulse), and
        // baton-pass (the handoff icon nudge when floor/control changes).
        rise: {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.35 },
        },
        'baton-pass': {
          '0%': { transform: 'translateX(0)' },
          '40%': { transform: 'translateX(4px) rotate(8deg)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
