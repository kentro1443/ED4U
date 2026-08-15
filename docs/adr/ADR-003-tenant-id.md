# ADR-003 Keep tenant_id in single-school V1

Every school-owned table has tenant_id. Queries always scope from the session, never from the client.
