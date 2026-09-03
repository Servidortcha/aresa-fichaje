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
        amber: { 50:"#FFF7ED", 100:"#FFEDD5", 500:"#F4791E", 600:"#E06A15" },
        green: { 50:"#E4F3EA", 100:"#C8E6D5", 600:"#4B7355", 700:"#365A3E" },
        red: { 50:"#FDECEA", 100:"#FAD5D0", 600:"#C7522A", 700:"#A84522" },
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
