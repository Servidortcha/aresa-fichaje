/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#4A4B4D",
        paper: "#F2EEE3",
        card: "#FAF8F3",
        line: "#D8D2C4",
        amber: "#F4791E",
        green: "#4B7355",
        red: "#C7522A",
        steel: "#4A4B4D",
        aresa: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          900: '#7f1d1d',
        }
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
}
