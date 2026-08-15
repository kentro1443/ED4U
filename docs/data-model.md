# Data model

- `user.id` is a UUID. Login username is `SchoolMembership.school_member_code` (unique per tenant, immutable in V1).
- Every school-owned table has `tenant_id`.
- Roles live on `UserRoleAssignment`, not a single `users.role` column.
- Room features are `RoomFeatureDefinition` + `RoomFeatureValue`.
- Application PDFs are `ApplicationSubmissionVersion` rows.
- Approved finance rows are immutable; correction is VOID + new entry.
