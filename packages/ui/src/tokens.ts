/**
 * ED4U Design Tokens (Reference & Static Types).
 *
 * NOTE: The canonical runtime source of truth for the web application is
 * the CSS Custom Properties declared in `apps/web/src/app/globals.css`.
 * This file serves as a TypeScript reference and static definition.
 */
export const ed4uTokens = {
  colors: {
    primary: "#1749c8",
    primaryHover: "#1d4ed8",
    primaryActive: "#123a9f",
    primaryDisabled: "#dbeafe",
    ink: "#0b1220",
    body: "#334155",
    muted: "#64748b",
    mutedSoft: "#94a3b8",
    hairline: "#e2e8f0",
    hairlineSoft: "#edf2f7",
    canvas: "#f8fafc",
    surfaceSoft: "#f1f5f9",
    surfaceCard: "#ffffff",
    surfaceStrong: "#e2e8f0",
    surfaceDark: "#0b1220",
    surfaceDarkElevated: "#172033",
    onPrimary: "#ffffff",
    onDark: "#ffffff",
    onDarkSoft: "#a1a1aa",
    brandAccent: "#2563eb",
    brandAccentSoft: "#eff6ff",
    success: "#15803d",
    successSoft: "#f0fdf4",
    successText: "#166534",
    warning: "#b45309",
    warningSoft: "#fffbeb",
    warningText: "#92400e",
    error: "#b91c1c",
    errorSoft: "#fef2f2",
    errorText: "#991b1b",
    badgeOrange: "#fb923c",
    badgePink: "#ec4899",
    badgeViolet: "#8b5cf6",
    badgeEmerald: "#34d399",
  },
  radius: {
    xs: "6px",
    sm: "10px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    pill: "9999px",
    full: "9999px",
  },
  spacing: {
    xxs: "4px",
    xs: "8px",
    sm: "12px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "48px",
    section: "96px",
  },
  shadows: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 12px 0 rgba(0, 0, 0, 0.06)",
    lg: "0 12px 24px -4px rgba(0, 0, 0, 0.08)",
  },
} as const;

export type ED4UTokens = typeof ed4uTokens;
