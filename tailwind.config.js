/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#0b1320',
        panel: '#142034',
        accent: '#22d3ee',
        accentSoft: '#164e63',
        warn: '#f97316',
        ok: '#34d399',
        danger: '#fb7185'
      }
    }
  },
  plugins: []
};