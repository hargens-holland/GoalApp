import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design tokens (see handoff README)
        bg: "#0a0a0c",
        sidebar: "#0c0c0f",
        card: "#141419",
        "card-2": "#101014",
        field: "#0d0d11",
        "task-card": "#16161c",
        elevated: "#1c1c24",
        primary: {
          DEFAULT: "#6d56f0",
          hover: "#7d68ff",
          soft: "rgba(109,86,240,0.15)",
        },
        ink: {
          DEFAULT: "#f4f4f5",
          2: "#a1a1aa",
          3: "#71717a",
          4: "#52525b",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
