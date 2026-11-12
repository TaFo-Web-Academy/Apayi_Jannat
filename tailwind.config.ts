import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: "#FDFCFB",
          100: "#FAF8F5",
          200: "#F3EFEA",
          300: "#E8E2D9",
        },
        rosewood: {
          50: "#FBF7F6",
          100: "#F5ECEA",
          200: "#EAD8D3",
          400: "#C49A8E",
          500: "#A87668",
          600: "#8C5D50",
          700: "#6E463B",
        },
        sage: {
          50: "#F4F8F6",
          100: "#E6F0EC",
          500: "#3B9B78",
          600: "#2E8565",
          700: "#236B50",
        },
        clay: {
          500: "#C07D53",
          600: "#A96840",
        },
        ink: {
          900: "#1F1D1A",
          700: "#4A453E",
          500: "#787167",
          400: "#9E968B",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 4px 28px -4px rgba(31, 29, 26, 0.05), 0 2px 8px -2px rgba(31, 29, 26, 0.03)",
        card: "0 10px 40px -10px rgba(31, 29, 26, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
