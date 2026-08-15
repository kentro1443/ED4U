# ADR-004 Mentor Engine isolated from application DB

The engine never queries Prisma. The app loads tenant-scoped candidates, validates output, and writes bookings after a live re-check.
