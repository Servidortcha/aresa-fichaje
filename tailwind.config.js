/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#203575",
        paper: "#F0F2F8",
        card: "#FFFFFF",
        line: "#CBD5E1",
        amber: "#F4791E",
        green: "#4B7355",
        red: "#C7522A",
        steel: "#2E6F9E",
        accent: "#3A8DDE",
        aresa: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3A8DDE',
          600: '#2E6F9E',
          700: '#203575',
          900: '#1A2B4A',
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
