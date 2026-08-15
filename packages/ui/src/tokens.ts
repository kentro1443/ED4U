/**
 * ED4U Design Tokens (Reference & Static Types).
 *
 * NOTE: The canonical runtime source of truth for the web application is
 * the CSS Custom Properties declared in `apps/web/src/app/globals.css`.
 * This file serves as a TypeScript reference and static definition.
 */
export const ed4uTokens = {
  colors: {
    primary: "#111111",
    primaryHover: "#242424",
    primaryActive: "#000000",
    primaryDisabled: "#e5e7eb",
    ink: "#111111",
    body: "#374151",
    muted: "#6b7280",
    mutedSoft: "#898989",
    hairline: "#e5e7eb",
    hairlineSoft: "#f3f4f6",
    canvas: "#ffffff",
    surfaceSoft: "#f9fafb",
    surfaceCard: "#f5f5f5",
    surfaceStrong: "#e5e7eb",
    surfaceDark: "#101010",
    surfaceDarkElevated: "#1a1a1a",
    onPrimary: "#ffffff",
    onDark: "#ffffff",
    onDarkSoft: "#a1a1aa",
    brandAccent: "#3b82f6",
    brandAccentSoft: "#eff6ff",
    success: "#10b981",
    successSoft: "#ecfdf5",
    successText: "#065f46",
    warning: "#f59e0b",
    warningSoft: "#fffbeb",
    warningText: "#92400e",
    error: "#ef4444",
    errorSoft: "#fef2f2",
    errorText: "#991b1b",
    badgeOrange: "#fb923c",
    badgePink: "#ec4899",
    badgeViolet: "#8b5cf6",
    badgeEmerald: "#34d399",
  },
  radius: {
    xs: "4px",
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
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
