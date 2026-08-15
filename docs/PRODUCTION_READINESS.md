# ED4U production readiness

This document separates **implemented product controls** from **deployment responsibilities**. Passing the repository test suite is necessary, but it is not a claim that an arbitrary laptop deployment is enterprise-ready.

## Implemented in the application

- Permission-specific server authorization with tenant/resource relationship checks.
- Database-backed login throttling (per IP+member-code and per IP buckets).
- Private application/club PDF storage adapter with PDF magic-byte validation, SHA-256 metadata, 10 MB limit, atomic local writes, and authorized download routes.
- Audit events for high-value mutations, plus domain notifications.
- `/api/health/live` and `/api/health/ready` (the latter checks PostgreSQL).
- Baseline browser security headers; production responses additionally receive a CSP from Next configuration.
- Transactional Mentor booking and Room approval paths with PostgreSQL locking and live-state rechecks.
- Real PostgreSQL concurrency tests for contested Mentor and Room sessions.
- Explicit tenant IANA timezone and host-timezone-independent school-local conversions.
- Deterministic demo reset, unit/integration/E2E coverage, full build and benchmark verification.

## Deployment controls still required before a real-school production launch

The deployment owner must provide these outside this repository or wire the provider implementation before claiming enterprise production readiness:

1. **Managed PostgreSQL** with encryption at rest/in transit, automated backups, PITR, tested restore drills, connection pooling, and restricted network access.
2. **Private object storage** replacing the local development storage provider, with short-lived signed access and malware scanning/quarantine before a file becomes downloadable.
3. **Central observability**: structured log shipping, error monitoring, metrics, tracing, SLOs, alert routing, and on-call ownership. Health endpoints alone are not observability.
4. **Secret management** from the deployment platform/KMS. Never commit `.env` or long-lived credentials.
5. **Edge/network controls**: TLS-only, trusted reverse-proxy configuration for client IPs, WAF/rate limits as a second layer, DDoS protections, and CSP reporting.
6. **Background delivery**: transactional outbox/queue for notifications and other side effects if delivery guarantees become contractual.
7. **Privacy/governance** for minors: retention schedule, access/export/delete processes, incident response, vendor/subprocessor register, and legal review applicable to the operating jurisdiction.
8. **True multi-school session context** if one account can belong to multiple tenants. V1 intentionally operates one school; it must not silently select `memberships[0]` for a multi-school launch.
9. **Release discipline**: staging environment, migration rehearsal, rollback/roll-forward procedure, dependency/security scanning, load tests, and penetration testing.
10. **Identity federation** (SSO/SAML/OIDC) only if a customer requires it. The current school-member-code authentication is the V1 product decision.

## Release gates

A release candidate should not be promoted unless:

- `node scripts/verify.mjs` is green from a clean checkout.
- Production migrations have been rehearsed against a staging snapshot.
- Restore from backup has been tested, not merely configured.
- Critical user journeys pass against the deployed staging service using real PostgreSQL and the production-equivalent file provider.
- No known Critical/High authorization, tenant-isolation, data-loss, or concurrency issue remains.
- Browser QA is completed at desktop and mobile widths with no unexpected console/network failures.
- Security/privacy owners have signed off on the deployment-specific controls above.

## File-provider boundary

`apps/web/src/lib/files/privateStorage.ts` is a **private local development provider**, not cloud object storage. Its authorization model and metadata contract should be preserved when replacing the byte store. The production provider must retain: private-by-default objects, content validation, integrity metadata, authorization-before-download, and immutable submission versions.
