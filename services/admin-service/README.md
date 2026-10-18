# Admin Service

Owner: Huy. Responsibility: administrative controls and platform operations APIs.

## Database Schema

- `MasterIngredient`: stores the managed ingredient catalog and nutrition metadata.
- `RecommendationWeight`: stores configurable recommendation weights.
- `RecommendationWeightHistory`: records changes to recommendation weights.
- `ServiceHealthLog`: stores service monitoring checks and response times.
- `AccountReport`: stores user account reports and resolution state.
- `AuditLog`: stores administrative actions and target metadata.

User IDs are plain strings because this service has its own database and does not create cross-service foreign keys.