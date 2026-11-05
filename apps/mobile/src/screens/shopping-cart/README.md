# Shopping cart screen (Khanh)

The screen calls the gateway using the bearer token and family from `useSession()`. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_API_BASE_URL` for an emulator or physical device.

Items saved to the shopping list are labeled **Để tham khảo** and do not change inventory. After the user confirms they bought an item, the screen calls the purchase endpoint and waits for inventory-service. Only a successful server response changes the item to **Đã mua • Đã thêm vào kho**. Older purchased items without a recorded inventory sync can be retried with **Đồng bộ kho**. Network or service errors keep the item retryable.

The shopping service verifies the JWT and family membership. It uses the server-side `INTERNAL_API_KEY` for inventory sync; no service secret is included in the app.
