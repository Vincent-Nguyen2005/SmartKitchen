# Theme

Owner: Huy. Responsibility: shared design tokens and the icon wrapper for the mobile app.

The palette is the one already used by the auth/family and notification/admin screens. In this PR only the notification and admin screens import it. Adoption by other members is optional and tracked in #71.

## Tokens (`tokens.ts`)

| Export | Values |
|---|---|
| `colors` | `primary` #2F6B5F, `text` #182A24, `muted` #65746C, `border` #DCE3DE, `surface` #FFFFFF, `background` #F4F7F2, `danger` #B42318, `warning` #B54708, `success` #067647, plus `*Soft` backgrounds and `overlay` |
| `chartColors` | `series` (5 colours, first = primary), `grid`, `axis`, `label`; used by the admin charts (`screens/admin/charts/`) |
| `spacing` | `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24 |
| `fontSize` | `caption` 12, `small` 14, `body` 15, `subtitle` 16, `title` 18, `headline` 22 |
| `radius` | `sm` 10, `md` 12, `lg` 16, `pill` 999 |
| `touchTarget` | 44 (minimum size of anything tappable) |
| `iconSize` / `iconStrokeWidth` | `sm` 16, `md` 20, `lg` 24, `xl` 40 / stroke 2 |
| `breakpoints` | `wide` 720 (multi-column), `extraWide` 1100 (3 columns), `splitMinHeight` 500 (list + detail side by side only when also this tall) |

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
