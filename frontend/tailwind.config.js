/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#78BE20',
          dark:    '#5A9A12',
          light:   '#94D43A',
        },
      },
    },
  },
  plugins: [],
}
