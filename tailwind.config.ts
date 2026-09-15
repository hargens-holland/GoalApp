import type { Config } from "tailwindcss";

/**
 * Design tokens.
 *
 * One light theme on warm paper. The interface itself is monochrome — ink on
 * paper, hairline rules — and the only color anywhere comes from goal hues
 * (lib/colors.ts). That restraint is the point: when four things are colored,
 * you can tell them apart; when everything is, nothing stands out.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#f6f3ec",
          2: "#eeeae0",
          3: "#e6e1d5",
        },
        surface: "#fffdf9",
        rule: {
          DEFAULT: "rgba(28,25,20,0.10)",
          2: "rgba(28,25,20,0.20)",
        },
        ink: {
          DEFAULT: "#1c1915",
          2: "#58534b",
          3: "#8b857a",
          4: "#b8b2a6",
        },
        danger: "#b4483a",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
