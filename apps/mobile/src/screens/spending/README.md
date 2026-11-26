# Chi tiêu

The capture bar's third button (Chụp ảnh · QR gia đình · **Chi tiêu**) opens a full-screen page with what the family spent in Đi chợ, from delivered orders only (by delivery date; orders on their way are in Giỏ hàng > Đơn hàng). Data: shopping-list-service `GET /api/shopping-list/spending` (see its README); every family member sees the same page.

| File | What it does |
|---|---|
| `SpendingScreen.tsx` | The page and the purchase detail sheet |
| `spending.ts` | Response types and pure display helpers (Vietnam months and times, VND, comparison line, quantities, buyer), covered by `spending.test.ts` |

## Layout (top to bottom)

1. **Top bar:** X on the left, "Chi tiêu" centered.
2. **Month switcher:** ‹ Tháng 11/2026 › (44 px buttons; › is disabled on the current month, no future months).
3. **Summary card:** "Tổng chi", the total in large bold VND ("1.250.000đ"), then "↑ 12% so với tháng 10" in the danger colour (more) or "↓ 5% …" in the success colour (less); hidden when the previous month was 0.
4. **Theo nhóm:** one row per catalog group (top 6, then "Khác"): name left, amount · % right, a bar in the primary colour on a light track (relative to the largest group).
5. **Đơn đã mua:** a virtualized list in one card: avatar, buyer name, "26/11 · 18:05 · 3 món", total right-aligned, thin inset dividers.
6. **Detail sheet:** "Đơn 26/11 · 18:05", buyer · item count; each line has name and "1,5 kg × 25.500đ" (original price struck through when discounted) on the left and the line total on the right; "Tổng cộng" below a divider.

## States

- **Loading:** skeleton blocks in the shape of the summary, bars and rows (soft pulse); never a spinner-only screen.
- **Empty month:** receipt icon + "Chưa có chi tiêu trong tháng này".
- **Error:** icon + message + "Thử lại"; a failed pull-to-refresh with data keeps the data and shows a small "Thử lại" notice.
- **No family:** "Bạn chưa có gia đình" + "Đến Gia đình".
- Changing month jumps back to the top; the total fades in and bars grow in 200 ms.

## Manual test

1. Buy something in Đi chợ (Giỏ hàng → Mua), then tap **Chi tiêu** in the bottom bar: the purchase is at the top of "Đơn đã mua" with your name and the same total as the cart.
2. Tap it: lines, quantities ("1,5 kg"), unit prices, struck-through original price for discounted items, total.
3. ‹ to the previous month; › is disabled on the current month.
4. A family member opens Chi tiêu on their phone: same page. Someone without a family sees "Bạn chưa có gia đình".
