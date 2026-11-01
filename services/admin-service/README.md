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

## Ingredients & Weights

Ingredient mutations, import/export, soft deletion, and recommendation-weight changes require `x-user-id` and `x-user-role: ADMIN` from the internal gateway. These headers are trusted only on the private service network until Auth Service JWT verification is available. Weight updates use optimistic locking with `expectedVersion`; values are validated in `[0, 1]` and the documented defaults are not normalized, so callers may choose their own total.
