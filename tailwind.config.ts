import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Semantic Theme Tokens
        terracotta: {
          50: "#FAF6F3",
          100: "#F3ECE6",
          200: "#E6D7CB",
          300: "#D6BFB0",
          400: "#C4A493",
          500: "#B89582",
          600: "#A27C67",
          700: "#866350",
          800: "#6B4D3D",
          900: "#543C2F",
        },
        sage: {
          50: "#F0F6F6",
          100: "#DCEAEB",
          200: "#BCD7D9",
          300: "#95BFC2",
          400: "#6FA5A9",
          500: "#4E878C",
          600: "#3E6D71",
          700: "#34575A",
          800: "#2D474A",
          900: "#283C3E",
        },
        cream: {
          50: "#FFFFFF",
          100: "#FDFCFA",
          200: "#FAF7F2",
          300: "#F4EFE6",
          400: "#EDE5D8",
          500: "#E3D7C5",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        warm: "0 4px 20px -2px rgba(134, 99, 80, 0.08), 0 2px 6px -1px rgba(134, 99, 80, 0.04)",
        "warm-lg": "0 10px 30px -3px rgba(134, 99, 80, 0.12), 0 4px 10px -2px rgba(134, 99, 80, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
