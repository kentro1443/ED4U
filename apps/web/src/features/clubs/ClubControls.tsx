"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import {
  addClubAdvisorAction,
  addClubDocumentVersionAction,
  approveFinanceEntryAction,
  createClubDocumentAction,
  createClubEventAction,
  createFinanceEntryAction,
  joinClubAction,
  proposeClubAction,
  resolveClubEventAction,
  resolveClubMembershipAction,
  resolveClubProposalAction,
  transferClubPresidencyAction,
  voidFinanceEntryAction,
} from "./actions";

function useMutationFeedback() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Không thể xử lý yêu cầu.");
      else router.refresh();
    });
  };
  return { isPending, error, run };
}

export function ProposeClubForm() {
  const { isPending, error, run } = useMutationFeedback();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="space-y-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4">
      <h2 className="text-sm font-semibold text-[var(--ink)]">Đề xuất câu lạc bộ mới</h2>
      <div className="grid gap-3 md:grid-cols-[240px_1fr_auto] md:items-end">
        <Field id="club-name" label="Tên CLB">
          <Input
            id="club-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CLB Khoa học dữ liệu"
          />
        </Field>
        <Field id="club-description" label="Mục tiêu & hoạt động">
          <Textarea
            id="club-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Button
          type="button"
          variant="primary"
          disabled={isPending}
          onClick={() => run(() => proposeClubAction({ name, description }))}
        >
          Gửi đề xuất
        </Button>
      </div>
      {error ? (
        <Alert tone="danger" title="Không thể gửi đề xuất">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

export function ClubProposalDecision({ clubId }: { clubId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 space-y-2 border-t border-[var(--hairline-soft)] pt-3">
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Lý do (bắt buộc nếu từ chối)"
        aria-label="Lý do quyết định CLB"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={isPending}
          onClick={() => run(() => resolveClubProposalAction({ clubId, approve: true }))}
        >
          Duyệt CLB
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={isPending}
          onClick={() => run(() => resolveClubProposalAction({ clubId, approve: false, reason }))}
        >
          Từ chối
        </Button>
      </div>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function JoinClubButton({ clubId }: { clubId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={isPending}
        onClick={() => run(() => joinClubAction(clubId))}
      >
        Xin tham gia CLB
      </Button>
      {error ? <p className="mt-1 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function MembershipDecision({ membershipId }: { membershipId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={isPending}
        onClick={() => run(() => resolveClubMembershipAction({ membershipId, approve: true }))}
      >
        Duyệt
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => run(() => resolveClubMembershipAction({ membershipId, approve: false }))}
      >
        Từ chối
      </Button>
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function PresidencyTransfer({
  clubId,
  members,
}: {
  clubId: string;
  members: Array<{ id: string; label: string }>;
}) {
  const { isPending, error, run } = useMutationFeedback();
  const [target, setTarget] = useState(members[0]?.id ?? "");
  if (!members.length) return null;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field id="president-target" label="Chuyển quyền President">
        <Select id="president-target" value={target} onChange={(e) => setTarget(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isPending || !target}
        onClick={() =>
          run(() => transferClubPresidencyAction({ clubId, targetMembershipId: target }))
        }
      >
        Chuyển quyền
      </Button>
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function AdvisorAdd({
  clubId,
  teachers,
}: {
  clubId: string;
  teachers: Array<{ id: string; name: string }>;
}) {
  const { isPending, error, run } = useMutationFeedback();
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  if (!teachers.length) return null;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field id="advisor-teacher" label="Thêm advisor">
        <Select
          id="advisor-teacher"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
        >
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => run(() => addClubAdvisorAction({ clubId, teacherId }))}
      >
        Thêm advisor
      </Button>
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function FinanceCreate({ clubId }: { clubId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="grid gap-2 rounded-lg border border-[var(--hairline)] p-3 sm:grid-cols-4">
      <Select
        value={kind}
        onChange={(e) => setKind(e.target.value as "INCOME" | "EXPENSE")}
        aria-label="Loại bút toán"
      >
        <option value="INCOME">Thu</option>
        <option value="EXPENSE">Chi</option>
      </Select>
      <Input
        type="number"
        min={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Số tiền"
        aria-label="Số tiền"
      />
      <Input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Danh mục"
        aria-label="Danh mục"
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Mô tả"
        aria-label="Mô tả"
      />
      <div className="sm:col-span-4">
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={isPending}
          onClick={() =>
            run(() =>
              createFinanceEntryAction({
                clubId,
                kind,
                amount: Number(amount),
                category,
                description,
              }),
            )
          }
        >
          Ghi sổ (chờ duyệt)
        </Button>
      </div>
      {error ? <p className="sm:col-span-4 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function FinanceDecision({
  entryId,
  status,
  canApprove,
  canVoid,
}: {
  entryId: string;
  status: string;
  canApprove: boolean;
  canVoid: boolean;
}) {
  const { isPending, error, run } = useMutationFeedback();
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      {status === "PENDING" && canApprove ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={isPending}
          onClick={() => run(() => approveFinanceEntryAction(entryId))}
        >
          Duyệt bút toán
        </Button>
      ) : null}
      {status === "APPROVED" && canVoid ? (
        <div className="flex gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do VOID"
            aria-label="Lý do VOID"
          />
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={isPending}
            onClick={() => run(() => voidFinanceEntryAction(entryId, reason))}
          >
            VOID
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function ClubEventCreate({ clubId }: { clubId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  const submit = (formData: FormData) =>
    run(() =>
      createClubEventAction({
        clubId,
        title: String(formData.get("title") ?? ""),
        startAt: String(formData.get("startAt") ?? ""),
        endAt: String(formData.get("endAt") ?? ""),
        visibility: String(formData.get("visibility") ?? "CLUB") as
          "SCHOOL" | "GRADE" | "CLASS" | "CLUB" | "PRIVATE",
        roomRequired: formData.get("roomRequired") === "on",
      }),
    );
  return (
    <form
      action={submit}
      className="grid gap-2 rounded-lg border border-[var(--hairline)] p-3 md:grid-cols-5"
    >
      <Input name="title" required placeholder="Tên sự kiện" />
      <Input name="startAt" type="datetime-local" required />
      <Input name="endAt" type="datetime-local" required />
      <Select name="visibility" defaultValue="CLUB">
        <option value="CLUB">CLB</option>
        <option value="SCHOOL">Toàn trường</option>
      </Select>
      <label className="flex items-center gap-2 text-xs">
        <input name="roomRequired" type="checkbox" />
        Cần phòng
      </label>
      <div className="md:col-span-5">
        <Button type="submit" size="sm" variant="primary" disabled={isPending}>
          Tạo đề xuất sự kiện
        </Button>
      </div>
      {error ? <p className="md:col-span-5 text-xs text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}

export function ClubEventDecision({ eventId }: { eventId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={isPending}
        onClick={() => run(() => resolveClubEventAction({ eventId, approve: true }))}
      >
        Duyệt sự kiện
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          run(() =>
            resolveClubEventAction({ eventId, approve: false, reason: "Không được phê duyệt" }),
          )
        }
      >
        Từ chối
      </Button>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function ClubDocumentCreate({ clubId }: { clubId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  const submit = (formData: FormData) => run(() => createClubDocumentAction(clubId, formData));
  return (
    <form
      action={submit}
      className="grid gap-2 rounded-lg border border-[var(--hairline)] p-3 sm:grid-cols-[1fr_180px_1fr_auto]"
    >
      <Input name="title" required placeholder="Tên tài liệu" />
      <Select name="visibility" defaultValue="ALL_MEMBERS">
        <option value="ALL_MEMBERS">Tất cả thành viên</option>
        <option value="CORE_PLUS">Core+</option>
        <option value="VP_PLUS">VP+</option>
        <option value="PRESIDENT_ONLY">President</option>
        <option value="SCHOOL_ADMIN_ONLY">School Admin</option>
      </Select>
      <input name="file" type="file" accept="application/pdf,.pdf" required className="text-xs" />
      <Button type="submit" size="sm" variant="primary" disabled={isPending}>
        Tải lên
      </Button>
      {error ? <p className="sm:col-span-4 text-xs text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}

export function ClubDocumentVersionAdd({ documentId }: { documentId: string }) {
  const { isPending, error, run } = useMutationFeedback();
  const submit = (formData: FormData) =>
    run(() => addClubDocumentVersionAction(documentId, formData));
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input
        name="file"
        type="file"
        accept="application/pdf,.pdf"
        required
        className="max-w-52 text-xs"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
        Thêm phiên bản
      </Button>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}
