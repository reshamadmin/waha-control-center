/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1f2430",
        muted: "#6d7480",
        panel: "#ffffff",
        line: "#d8dde6",
        brand: "#fdbb12",
        accent: "#1659b8",
        success: "#157f63",
        warning: "#a87812",
        danger: "#b24c44",
      },
      fontFamily: {
        sans: ["Segoe UI", "Helvetica Neue", "sans-serif"],
      },
    },
  },
  plugins: [],
}
