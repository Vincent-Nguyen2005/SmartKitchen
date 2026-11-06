/**
 * Design tokens for SmartKitchen mobile (owner: Huy). The palette is the one already used by the
 * auth/family and notification/admin screens. Adoption by other screens is optional (#71).
 */
export const colors = {
  primary: "#2F6B5F",
  primaryText: "#FFFFFF",
  primarySoft: "#E8F3EF",
  text: "#182A24",
  muted: "#65746C",
  border: "#DCE3DE",
  surface: "#FFFFFF",
  background: "#F4F7F2",
  danger: "#B42318",
  dangerSoft: "#FEE4E2",
  warning: "#B54708",
  warningSoft: "#FEF0C7",
  success: "#067647",
  successSoft: "#DCFAE6",
  unread: "#E8F3EF",
  overlay: "rgba(0, 0, 0, 0.3)",
} as const;

/** 4-point spacing scale. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const fontSize = { caption: 12, small: 14, body: 15, subtitle: 16, title: 18, headline: 22 } as const;

export const textStyles = {
  caption: { fontSize: fontSize.caption },
  captionMedium: { fontSize: fontSize.caption, fontWeight: "500" },
  captionSemibold: { fontSize: fontSize.caption, fontWeight: "700" },
  captionBold: { fontSize: fontSize.caption, fontWeight: "800" },
  small: { fontSize: fontSize.small },
  smallSemibold: { fontSize: fontSize.small, fontWeight: "700" },
  smallBold: { fontSize: fontSize.small, fontWeight: "800" },
  body: { fontSize: fontSize.body },
  bodyBold: { fontSize: fontSize.body, fontWeight: "800" },
  subtitleBold: { fontSize: fontSize.subtitle, fontWeight: "800" },
  titleBold: { fontSize: fontSize.title, fontWeight: "800" },
  headlineBold: { fontSize: fontSize.headline, fontWeight: "800" },
} as const;

export const radius = { sm: 10, md: 12, lg: 16, pill: 999 } as const;

/** Minimum size of anything tappable (Apple HIG 44 pt, Material 48 dp lower bound used by the team). */
export const touchTarget = 44;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 40 } as const;
export const iconStrokeWidth = 2;

/**
 * Layout breakpoints in dp. `wide` switches to multi-column grids; `split` (list + detail side by side)
 * additionally needs `splitMinHeight` so phones in landscape keep enough height for the list.
 */
export const breakpoints = { wide: 720, extraWide: 1100, splitMinHeight: 500 } as const;
