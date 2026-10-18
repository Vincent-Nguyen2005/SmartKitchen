# Notification Service

Owner: Huy. Responsibility: notification delivery and notification preference APIs.

## Database Schema

- `Notification`: stores user/family messages, delivery channel, state, and timestamps.
- `DeviceToken`: stores active iOS/Android push tokens per user.
- `NotificationPreference`: stores per-user delivery and quiet-hour settings.
- `PartnerSupermarket`: stores promotion partners.
- `Promotion`: stores partner promotions and their active date range.

User and family IDs are plain strings because this service has its own database and does not create cross-service foreign keys.