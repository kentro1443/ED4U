# Runbook

```bash
npm run services:up
npx prisma migrate deploy
npm run db:seed
npm run build
npm run start
```

Health: `/login` must render the ED4U wordmark.

Reset a demo password as ADMIN_IT from Members (temporary password + `must_change_password`).
