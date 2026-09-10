import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/** Wrap a token so Tailwind can still apply opacity modifiers (`bg-surface/60`). */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

/** A status tone: muted background, saturated text, subtle ring. */
const tone = (name: string) => ({
  bg: token(`tone-${name}-bg`),
  fg: token(`tone-${name}-fg`),
  ring: token(`tone-${name}-ring`),
});

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        surface: {
          DEFAULT: token("surface"),
          raised: token("surface-raised"),
          hover: token("surface-hover"),
        },
        muted: { foreground: token("muted-foreground") },
        subtle: { foreground: token("subtle-foreground") },
        border: {
          DEFAULT: token("border"),
          strong: token("border-strong"),
        },
        input: token("input"),
        ring: token("ring"),
        primary: {
          DEFAULT: token("primary"),
          hover: token("primary-hover"),
          foreground: token("primary-foreground"),
          subtle: token("primary-subtle"),
        },
        danger: {
          DEFAULT: token("danger"),
          foreground: token("danger-foreground"),
          subtle: token("danger-subtle"),
        },
        overdue: token("overdue"),
        tone: {
          slate: tone("slate"),
          blue: tone("blue"),
          amber: tone("amber"),
          violet: tone("violet"),
          rose: tone("rose"),
          emerald: tone("emerald"),
        },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        md: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Page title 24/600, section 16/600, body 14/400, meta 12/500.
        title: ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        section: ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        meta: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.05em" }],
      },
      spacing: {
        sidebar: "240px",
        "sidebar-collapsed": "56px",
        topbar: "56px",
      },
      maxWidth: { content: "1400px" },
      boxShadow: {
        // The only shadow in the system. Popovers and dialogs, nothing else.
        popover:
          "0 8px 24px -6px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
        dialog: "200ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0, 0, 0.2, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "zoom-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "zoom-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.97)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-left": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms cubic-bezier(0, 0, 0.2, 1)",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
