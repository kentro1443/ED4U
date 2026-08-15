# Benchmarks

## Mentor

```bash
npm run benchmark:mentor
```

Writes `packages/mentor-engine/data/benchmark/report.json` and copies to `benchmark/reports/mentor-latest.json`.

Human NDCG/Precision stay `NOT_MEASURED` until labelled gold exists.

## Facility

```bash
npm run benchmark:facility
```

Writes `benchmark/reports/facility-latest.json` and `latest.md`.

Target: hard-constraint violation rate = 0.
