/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "#2A2D35",
        input: "#13151A",
        ring: "#FF4D29",
        background: "#090A0C",
        foreground: "#F4F5F7",
        primary: {
          DEFAULT: "#FF4D29",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#13151A",
          foreground: "#D1D5DB",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#F4F5F7",
        },
        muted: {
          DEFAULT: "#1E2024",
          foreground: "#8E96A4",
        },
        accent: {
          DEFAULT: "#FFB300",
          foreground: "#090A0C",
        },
        popover: {
          DEFAULT: "#13151A",
          foreground: "#F4F5F7",
        },
        card: {
          DEFAULT: "#090A0C",
          foreground: "#F4F5F7",
        },
      },
      borderRadius: {
        lg: "0px",
        md: "0px",
        sm: "0px",
      },
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
        heading: ["Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}