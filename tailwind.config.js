/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        afl: {
          green: '#00843D',
          gold: '#FFB81C',
          dark: '#1a1a2e',
          navy: '#16213e',
        },
      },
    },
  },
  plugins: [],
}
