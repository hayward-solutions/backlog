import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        brand: {
          50: "#E9F2FF",
          100: "#CCE0FF",
          200: "#85B8FF",
          300: "#579DFF",
          400: "#388BFF",
          500: "#1D7AFC",
          600: "#0C66E4",
          700: "#0055CC",
          800: "#09326C",
          900: "#1C2B41",
        },
        ink: {
          0: "#FFFFFF",
          50: "#F7F8F9",
          100: "#F1F2F4",
          200: "#DCDFE4",
          300: "#B3B9C4",
          400: "#8590A2",
          500: "#758195",
          600: "#626F86",
          700: "#44546F",
          800: "#2C3E5D",
          900: "#172B4D",
        },
        danger: {
          50: "#FFEDEB",
          100: "#FFD5D2",
          500: "#E2483D",
          600: "#C9372C",
          700: "#AE2A19",
        },
        warning: {
          50: "#FFF7D6",
          100: "#F8E6A0",
          500: "#E2B203",
          600: "#B38600",
          700: "#7F5F01",
        },
        success: {
          50: "#DCFFF1",
          100: "#BAF3DB",
          500: "#22A06B",
          600: "#1F845A",
          700: "#164B35",
        },
        purple: {
          50: "#F3F0FF",
          100: "#DFD8FD",
          500: "#8270DB",
          600: "#6E5DC6",
          700: "#5E4DB2",
        },
        teal: {
          50: "#E3FAFC",
          500: "#1D7F8C",
          600: "#206B74",
        },
        magenta: {
          50: "#FFECF8",
          500: "#CD519D",
          600: "#AE4787",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(9,30,66,0.08)",
        raised:
          "0 1px 1px rgba(9,30,66,0.25), 0 0 1px rgba(9,30,66,0.31)",
        overlay:
          "0 8px 12px rgba(9,30,66,0.15), 0 0 1px rgba(9,30,66,0.31)",
        drawer: "-8px 0 24px rgba(9,30,66,0.12)",
        focus: "0 0 0 2px #4C9AFF",
      },
      borderRadius: {
        xs: "3px",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.2, 0, 0, 1)",
        "scale-in": "scale-in 160ms cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
