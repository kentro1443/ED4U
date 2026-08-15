"use client";

import { useMemo, useState } from "react";
import {
  MATCH_SCORE_DISCLAIMER,
  layoutMatchSpace,
  type ConstraintLens,
  type MentorNodeInput,
} from "@ed4u/domain/match-space";

export function MatchSpaceView({
  requestId,
  engineVersion,
  mentors,
}: {
  requestId: string;
  engineVersion: string;
  mentors: MentorNodeInput[];
}) {
  const [lens, setLens] = useState<ConstraintLens>("All");
  const [skill, setSkill] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const filtered = mentors.filter((m) => {
    if (skill && !m.clusterKey?.includes(skill)) return false;
    return true;
  });

  const layout = useMemo(
    () => layoutMatchSpace({ requestId, engineVersion, mentors: filtered, lens }),
    [requestId, engineVersion, filtered, lens],
  );
  const selectedNode = layout.nodes.find((n) => n.mentorId === selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          {MATCH_SCORE_DISCLAIMER}
        </p>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="constraint-lens">
          {(["All", "Eligible", "Filtered out"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLens(l)}
              className={`rounded-full px-3 py-1 text-sm ${lens === l ? "bg-[var(--pine)] text-white" : "border border-[var(--line)]"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="text-sm">
            Skill
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="ml-2 rounded border border-[var(--line)] px-2 py-1"
              data-testid="filter-skill"
            />
          </label>
          <label className="text-sm">
            Ngân sách
            <input
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              className="ml-2 rounded border border-[var(--line)] px-2 py-1"
              data-testid="filter-budget"
            />
          </label>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}
          >
            Zoom +
          </button>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
          >
            Zoom −
          </button>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => setPan((p) => ({ x: p.x - 12, y: p.y }))}
          >
            Pan
          </button>
        </div>
        <svg
          viewBox="-120 -120 240 240"
          className="mt-4 h-[420px] w-full rounded-xl bg-[#ebe4d6]"
          role="img"
          aria-label="Mentor Match Space"
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {[100, 80, 70, 40].map((score) => (
              <circle key={score} r={(1 - score / 100) * 90 + 18} fill="none" stroke="#c9bead" />
            ))}
            <circle r="6" fill="#1f4d3a" />
            <text y="16" textAnchor="middle" fontSize="6" fill="#1f4d3a">
              Bạn
            </text>
            {layout.nodes.map((n) => (
              <g
                key={n.mentorId}
                transform={`translate(${n.x * 90} ${n.y * 90})`}
                onMouseEnter={() => setHover(n.mentorId)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setSelected(n.mentorId)}
                className="cursor-pointer"
              >
                <circle
                  r={n.eligible ? 5 : 3.5}
                  fill={n.eligible ? "#b4532a" : "#9a9084"}
                  opacity={n.eligible ? 1 : 0.45}
                />
                {hover === n.mentorId ? (
                  <text y="-8" textAnchor="middle" fontSize="5">
                    {n.matchScore}
                  </text>
                ) : null}
              </g>
            ))}
          </g>
        </svg>
      </div>
      <aside
        className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"
        data-testid="mentor-detail"
      >
        {selectedNode ? (
          <div>
            <h2 className="text-lg font-medium">{selectedNode.mentorId}</h2>
            <p>Tốt nghiệp · điểm {selectedNode.matchScore}</p>
            <p className="mt-2 text-sm font-semibold">Top reasons</p>
            <ul className="list-disc pl-5 text-sm">
              <li>Bám sát kỹ năng mục tiêu</li>
              <li>Khớp ngân sách / lịch</li>
            </ul>
            <p className="mt-2 text-sm font-semibold">Trade-offs</p>
            <p className="text-sm text-[var(--muted)]">
              {selectedNode.rejectionReasons.join(", ") || "Không có ràng buộc cứng bị vi phạm."}
            </p>
            <p className="mt-2 text-sm">Availability match · Budget match · Skills</p>
            <div className="mt-4 flex gap-2">
              <a
                className="rounded-full bg-[var(--pine)] px-3 py-1.5 text-sm text-white"
                href={`/mentor/${selectedNode.mentorId}`}
              >
                View Profile
              </a>
              <button type="button" className="rounded-full border px-3 py-1.5 text-sm">
                Request Mentor
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Chọn một mentor trên bản đồ hoặc trong bảng.
          </p>
        )}
      </aside>
      <div className="lg:col-span-2 overflow-x-auto" data-testid="match-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <th className="py-2">Mentor</th>
              <th>Score</th>
              <th>Eligible</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {layout.nodes.map((n) => (
              <tr key={n.mentorId} className="border-b border-[var(--line)]">
                <td className="py-2">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setSelected(n.mentorId)}
                  >
                    {n.mentorId}
                  </button>
                </td>
                <td>{n.matchScore}</td>
                <td>{n.eligible ? "yes" : "no"}</td>
                <td>{n.rejectionReasons.join("; ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
