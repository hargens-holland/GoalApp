import type { Config } from "tailwindcss";

/**
 * Design tokens.
 *
 * One light theme on cool, neutral paper. The interface itself is monochrome —
 * ink on paper, hairline rules — and the only color anywhere comes from goal hues
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
          DEFAULT: "#f4f5f7",
          2: "#e9ebef",
          3: "#dcdfe5",
        },
        surface: "#ffffff",
        rule: {
          DEFAULT: "rgba(21,23,28,0.10)",
          2: "rgba(21,23,28,0.22)",
        },
        ink: {
          DEFAULT: "#15171c",
          2: "#4b5060",
          3: "#7c8190",
          4: "#aeb2bc",
        },
        danger: "#c0392b",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
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
