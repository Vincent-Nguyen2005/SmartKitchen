# Theme

Owner: Huy. Responsibility: shared design tokens, the type scale and the icon wrapper for the mobile app.

The palette is the one already used by the auth/family and notification/admin screens. Today only the notification and admin screens import the theme. Adoption by other members is optional and tracked in #71.

## Tokens (`tokens.ts`)

| Export | Values |
|---|---|
| `colors` | `primary` #2F6B5F, `text` #182A24, `muted` #65746C, `border` #DCE3DE, `surface` #FFFFFF, `background` #F4F7F2, `danger` #B42318, `warning` #B54708, `success` #067647, plus `*Soft` backgrounds and `overlay` |
| `chartColors` | `series` (5 colours, first = primary), `grid`, `axis`, `label`; used by the admin charts (`screens/admin/charts/`) |
| `spacing` | `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24 |
| `fontSize` | **Deprecated**, use `typography` below. Kept unchanged (`caption` 12, `small` 14, `body` 15, `subtitle` 16, `title` 18, `headline` 22) so existing imports keep working |
| `radius` | `sm` 10, `md` 12, `lg` 16, `pill` 999 |
| `touchTarget` | 44 (minimum size of anything tappable) |
| `iconSize` / `iconStrokeWidth` | `sm` 16, `md` 20, `lg` 24, `xl` 40 / stroke 2 |
| `breakpoints` | `wide` 720 (multi-column), `extraWide` 1100 (3 columns), `splitMinHeight` 500 (list + detail side by side only when also this tall) |

## Typography (`typography.ts`, `AppText.tsx`)

Agreed type scale (team decision, #71). System font only, no font files: iOS San Francisco (`"System"`), Android Roboto (`"sans-serif"`), web a `system-ui` stack so text never falls back to serif.

| Variant | Size | Weight | Line height | Use for |
|---|---|---|---|---|
| `pageTitle` | 28 | 700 | 36 | The page title (iOS Title 1), one per screen |
| `heading` | 22 | 700 | 28 | Dialog / full-screen modal titles, big status values |
| `subheading` | 18 | 700 | 24 | Section and card titles |
| `body` | 16 | 400 | 21 | Body text, inputs |
| `bodySmall` | 14 | 400 | 18 | Secondary text, field labels, segment labels |
| `caption` | 12 | 400 | 16 | Meta text, chart axes and values (the minimum) |
| `label` | 16 | 600 | 21 | Button text, row labels |
| `labelSmall` | 14 | 600 | 18 | Badges, selected segment, small buttons |

Exports: `typography` (size / weight / lineHeight / fontFamily per variant), `textStyles` (the same plus a default colour: `colors.text`, captions `colors.muted`), `AppText`, `fontFamily`, `minFontSize` (12).

```tsx
import { AppText, colors, textStyles, typography } from "../../theme";

<AppText variant="pageTitle" accessibilityRole="header">Thông báo</AppText>
<AppText variant="caption" color={colors.danger}>Không tải được</AppText>

// In a StyleSheet: spread the token, then add layout and colour.
const local = StyleSheet.create({ title: { ...typography.subheading, color: colors.primary, marginBottom: 8 } });
<Text style={[textStyles.body, local.extra]}>…</Text>

// SVG text (react-native-svg) does not inherit the React Native font: pass both explicitly.
<SvgText fontSize={typography.caption.fontSize} fontFamily={typography.caption.fontFamily}>…</SvgText>
```

Rules:
- **No hard-coded `fontSize`**: always a variant from `typography` / `textStyles` / `AppText`.
- **Minimum 12** (`caption`); nothing smaller, including chart labels.
- Button and label text use `label` / `labelSmall` (weight 600).
- Do not put `lineHeight` on `TextInput` (it can clip on Android); inputs use `typography.body.fontSize` and `fontFamily` only.

## Icons (`icons.tsx`)

Icons come from `lucide-react-native` (pinned, uses `react-native-svg`). Import icons by name, never `import *`.

```tsx
import { Bell, X } from "lucide-react-native";
import { AppIcon, IconButton } from "../../theme";

// Decorative icon next to text: hidden from screen readers.
<AppIcon icon={Bell} size="sm" color={colors.primary} />

// Icon-only button: accessibilityLabel is required, touch target is at least 44 x 44.
<IconButton icon={X} accessibilityLabel="Đóng" onPress={close} />
```

Rules: one size from `iconSize`, stroke 2, colour from `colors`. Never show state by colour alone; pair the icon with text.
