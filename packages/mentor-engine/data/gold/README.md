# Human gold set

Machine metrics (latency, determinism, constraint violations) tell you the
engine **works**. They cannot tell you it is **right**. That needs people.

This directory holds the scenarios reviewers judge, and the labels they produce.

> ## Do not fabricate labels
>
> No script in this repository writes a relevance judgement, and none ever
> should. A synthesised label is not a weak signal — it is a fake measurement.
> Scoring the engine against invented labels reports the engine agreeing with
> itself, dressed up as human agreement. That is worse than reporting nothing,
> because it looks like evidence.
>
> Until real reviewers have labelled these scenarios, the benchmark reports
> `humanQuality.status = "NOT_MEASURED"` and NDCG@3, Precision@3 and pairwise
> agreement stay `null`. That is the honest state, not a gap to be filled in.

## Files

| Path | Written by | Contents |
| --- | --- | --- |
| `gold-set.template.json` | `npm run goldset:template` | 60 scenarios × 8 candidates, all `labels` arrays **empty** |
| `labels/<reviewerId>.json` | **a human reviewer** | That reviewer's judgements |

## Scenario format (`gold-set.v1`)

```json
{
  "formatVersion": "gold-set.v1",
  "engineVersion": "mentor-engine-v1.0.0",
  "seed": 42,
  "labelsAreFabricated": false,
  "scenarios": [
    {
      "scenarioId": "GS-001",
      "requestId": "R00007",
      "request": { "goal": { "domain": "IELTS", "...": "..." } },
      "candidateMentorIds": ["M0042", "M0117", "..."],
      "labels": []
    }
  ]
}
```

Candidates are sampled **at random from the eligible pool** and listed in id
order — deliberately *not* in the engine's ranking order. Showing reviewers the
engine's own favourites first would anchor their judgement to the thing being
evaluated, and would hide the engine's worst mistakes: good mentors it ranked
far down would never be seen, so the metric could never catch them.

## Label format (`gold-labels.v1`)

One file per reviewer, so disagreement between reviewers stays visible:

```json
{
  "formatVersion": "gold-labels.v1",
  "reviewerId": "reviewer-a",
  "labelledAt": "2026-03-01",
  "scenarios": [
    {
      "scenarioId": "GS-001",
      "requestId": "R00007",
      "labels": [
        { "mentorId": "M0042", "relevance": 3 },
        { "mentorId": "M0117", "relevance": 1 }
      ]
    }
  ]
}
```

### Relevance scale

| Grade | Meaning |
| --- | --- |
| 3 | Ideal match for this specific request |
| 2 | Good — would recommend |
| 1 | Weak but defensible |
| 0 | Unsuitable for this request |

## Procedure

1. Run `npm run goldset:template` to produce the scenarios.
2. Give each reviewer the template and this scale. **Do not show them engine
   output** — not the ranking, not the scores, not the reasons.
3. Use **at least two independent reviewers** per scenario, so inter-reviewer
   agreement can be measured. A metric built on one person's taste measures that
   person.
4. Save each reviewer's file to `labels/<reviewerId>.json`.
5. Re-run `npm run benchmark`. It picks the labels up automatically and switches
   `humanQuality.status` to `MEASURED`.

## Reading the results afterwards

- **NDCG@3** — whether the best mentors are near the top, discounted by position.
- **Precision@3** — the share of the top 3 the reviewers judged relevant (≥ 2).
- **Pairwise agreement** — of every pair the reviewers ordered strictly, how
  often the engine agreed.

Report inter-reviewer agreement alongside these. If two humans only agree with
each other 60% of the time, an engine scoring 60% is at human level, and a
number quoted without that context is misleading.
