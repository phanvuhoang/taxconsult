/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#028a39',
          dark:    '#016b2d',
          light:   '#03ab46',
        },
      },
    },
  },
  plugins: [],
}
