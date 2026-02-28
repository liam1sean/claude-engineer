/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/**/*.html",
    "./public/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0f1117",
        surface: "#1a1d27",
        border: "#2e3147",
        text: "#e2e4ef",
        muted: "#7c7f9b",
        accent: "#6c63ff",
        "accent-hover": "#5a52e0",
        error: "#e05a5a",
      },
    },
  },
  plugins: [],
}
