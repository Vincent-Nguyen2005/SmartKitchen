# Notification Service

Owner: Huy. Responsibility: notification delivery and notification preference APIs.

## Database Schema

- `Notification`: stores user/family messages, delivery channel, state, and timestamps.
- `DeviceToken`: stores active iOS/Android push tokens per user.
- `NotificationPreference`: stores per-user delivery and quiet-hour settings.
- `PartnerSupermarket`: stores promotion partners.
- `Promotion`: stores partner promotions and their active date range.

User and family IDs are plain strings because this service has its own database and does not create cross-service foreign keys.

## Promotions

Promotion ingestion uses `POST /partners/:partnerId/promotions` with `x-api-key` and `PARTNER_API_KEY`. Device tokens, preferences, matching, dispatch, and read-status APIs are mounted at the service root. Development defaults to `PUSH_PROVIDER=mock`; production can use Expo with `EXPO_ACCESS_TOKEN`. The scheduled dispatcher runs every 15 minutes unless `ENABLE_JOBS=false`, respects `DEFAULT_TIMEZONE` quiet hours, and deduplicates each promotion per user.
