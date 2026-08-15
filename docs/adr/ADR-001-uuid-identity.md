# ADR-001 UUID identity + school_member_code username

Internal `user_id` is a random UUID. Login username is immutable `school_member_code`, unique per tenant, never used as PK.
