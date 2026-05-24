/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gmv: {
          canvas: "var(--gmv-canvas)",
          bg: "var(--gmv-bg)",
          primary: "var(--gmv-primary)",
          "primary-hover": "var(--gmv-primary-hover)",
          "primary-soft": "var(--gmv-primary-soft)",
          text: "var(--gmv-text)",
          "text-strong": "var(--gmv-text-strong)",
          link: "var(--gmv-link)",
          muted: "var(--gmv-muted)",
          border: "var(--gmv-border)",
          ok: "var(--gmv-ok)",
          "ok-soft": "var(--gmv-ok-soft)",
          warn: "var(--gmv-warn)",
          "warn-soft": "var(--gmv-warn-soft)",
          danger: "var(--gmv-danger)",
          "danger-soft": "var(--gmv-danger-soft)",
          "table-head": "var(--gmv-table-head)",
          "row-hover": "var(--gmv-row-hover)",
          secondary: "var(--gmv-secondary-text)",
          "bc01-grand-month": "var(--gmv-bc01-grand-month-bg)",
          "bc01-grand-month-fg": "var(--gmv-bc01-grand-month-fg)",
          "bc01-grand-sum": "var(--gmv-bc01-grand-sum-bg)",
          "bc01-grand-sum-fg": "var(--gmv-bc01-grand-sum-fg)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "Inter",
          "Segoe UI",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
      },
      fontSize: {
        gmv: ["14px", { lineHeight: "1.45" }],
      },
      borderRadius: {
        "gmv-sm": "var(--gmv-radius-sm)",
        "gmv-md": "var(--gmv-radius-md)",
        "gmv-lg": "var(--gmv-radius-lg)",
      },
      boxShadow: {
        "gmv-1": "var(--gmv-shadow-1)",
        "gmv-2": "var(--gmv-shadow-2)",
      },
    },
  },
  plugins: [],
};
