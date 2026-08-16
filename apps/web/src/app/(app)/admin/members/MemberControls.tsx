"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DropdownMenu } from "@/components/ui/Overlays";
import { Field, Input, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import type { RosterIssue } from "@ed4u/domain";
import {
  createMemberAction,
  importRosterAction,
  resetMemberPasswordAction,
  setMembershipStatusAction,
} from "./actions";

export interface ClassOption {
  id: string;
  label: string;
}

/**
 * Provisioning controls.
 *
 * A temporary password exists for exactly one moment — the handover — so it is
 * surfaced in a dialog the administrator must acknowledge, with a copy control,
 * rather than in a toast that disappears after five seconds.
 */

export function RosterImportCard({ classCount }: { classCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [issues, setIssues] = useState<RosterIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setIssues([]);
    setError(null);
    startTransition(async () => {
      const result = await importRosterAction(formData);
      if (!result.ok) {
        setIssues(result.issues);
        setError(result.error ?? null);
        toast.error(
          result.issues.length > 0
            ? `Từ chối toàn bộ tệp: ${result.issues.length} dòng không hợp lệ.`
            : (result.error ?? "Không thể nhập danh sách."),
        );
        return;
      }
      toast.success(`Đã nhập ${result.created} tài khoản mới, cập nhật ${result.updated}.`);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <Card variant="soft" className="space-y-4 border-dashed">
      <form action={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Icons.applications className="h-4 w-4" aria-hidden="true" />
            Nhập danh sách thành viên (.csv)
          </p>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Cột bắt buộc:{" "}
            <span className="font-mono">full_name, class, school_member_code, member_type</span>.
            Nhập là một giao dịch — chỉ cần một dòng sai, toàn bộ tệp bị từ chối và không có thay
            đổi nào được ghi. Xuất từ Excel bằng “Save As → CSV UTF-8”.
          </p>
          <label htmlFor="roster-file" className="sr-only">
            Chọn tệp CSV danh sách thành viên
          </label>
          <input
            ref={inputRef}
            id="roster-file"
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
            className="w-full cursor-pointer text-xs text-[var(--muted)] file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-[var(--hairline)] file:bg-[var(--canvas)] file:px-3 file:py-1.5 file:text-xs file:font-semibold hover:file:bg-[var(--surface-soft)]"
          />
        </div>
        <Button type="submit" loading={pending} disabled={!fileName} className="shrink-0">
          Kiểm tra & nhập
        </Button>
      </form>

      {classCount === 0 && (
        <Alert tone="warning" title="Chưa có lớp nào trong trường">
          Học sinh bắt buộc phải thuộc một lớp đã tồn tại. Hãy tạo lớp trước khi nhập danh sách.
        </Alert>
      )}

      {error && (
        <Alert tone="danger" title="Không thể nhập danh sách">
          {error}
        </Alert>
      )}

      {issues.length > 0 && (
        <Alert tone="danger" title={`Đã từ chối toàn bộ tệp · ${issues.length} lỗi`}>
          <p className="mb-2">
            Không có thay đổi nào được ghi. Sửa các dòng dưới đây rồi tải lại tệp.
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px]">
            {issues.slice(0, 50).map((issue, index) => (
              <li key={`${issue.line}-${issue.column}-${index}`}>
                Dòng {issue.line} · {issue.column}: {issue.message}
              </li>
            ))}
          </ul>
          {issues.length > 50 && <p className="mt-2">…và {issues.length - 50} lỗi khác.</p>}
        </Alert>
      )}
    </Card>
  );
}

export function CreateMemberButton({ classes }: { classes: ClassOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [memberType, setMemberType] = useState("STUDENT");
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ code: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createMemberAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setCredential({ code: result.schoolMemberCode, password: result.temporaryPassword });
      toast.success(`Đã tạo tài khoản ${result.schoolMemberCode}.`);
      router.refresh();
    });
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Tạo tài khoản thành viên"
        description="Hệ thống sinh mật khẩu tạm thời và bắt buộc đổi ở lần đăng nhập đầu tiên."
        trigger={
          <Button size="sm">
            <Icons.plus className="h-4 w-4" aria-hidden="true" />
            Tạo tài khoản
          </Button>
        }
      >
        <form action={submit} className="space-y-4">
          <Field id="member-name" label="Họ và tên" required>
            <Input id="member-name" name="fullName" required maxLength={120} autoComplete="off" />
          </Field>
          <Field
            id="member-code"
            label="Mã thành viên trường"
            required
            description="2 chữ cái + 6 chữ số. Đây là tên đăng nhập và không thể đổi về sau."
          >
            <Input
              id="member-code"
              name="schoolMemberCode"
              required
              placeholder="HS000123"
              pattern="[A-Za-z]{2}[0-9]{6}"
              autoComplete="off"
              className="font-mono"
            />
          </Field>
          <Field id="member-type" label="Loại thành viên" required>
            <Select
              id="member-type"
              name="memberType"
              value={memberType}
              onChange={(event) => setMemberType(event.target.value)}
            >
              <option value="STUDENT">Học sinh</option>
              <option value="TEACHER">Giáo viên</option>
              <option value="STAFF">Nhân viên</option>
            </Select>
          </Field>
          {memberType === "STUDENT" && (
            <Field id="member-class" label="Lớp" required>
              <Select id="member-class" name="classId" required>
                <option value="">— Chọn lớp —</option>
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {error && (
            <Alert tone="danger" title="Không thể tạo tài khoản">
              {error}
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={pending}>
              Tạo tài khoản
            </Button>
          </div>
        </form>
      </Dialog>

      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
    </>
  );
}

export function MemberRowActions({
  membershipId,
  fullName,
  schoolMemberCode,
  status,
  isSelf,
}: {
  membershipId: string;
  fullName: string;
  schoolMemberCode: string;
  status: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [credential, setCredential] = useState<{ code: string; password: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeStatus(next: string) {
    startTransition(async () => {
      const result = await setMembershipStatusAction(membershipId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã cập nhật trạng thái của ${schoolMemberCode}.`);
      router.refresh();
    });
  }

  function resetPassword() {
    startTransition(async () => {
      const result = await resetMemberPasswordAction(membershipId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCredential({ code: result.schoolMemberCode, password: result.temporaryPassword });
      toast.success("Đã đặt lại mật khẩu và thu hồi mọi phiên đăng nhập.");
      router.refresh();
    });
  }

  const statusItems = ["ACTIVE", "GRADUATED", "SUSPENDED", "LEFT_SCHOOL"]
    .filter((option) => option !== status)
    .map((option) => ({
      label: `Đổi trạng thái → ${STATUS_LABELS[option] ?? option}`,
      onClick: () => changeStatus(option),
      disabled: isSelf,
      danger: option === "SUSPENDED" || option === "LEFT_SCHOOL",
    }));

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirmReset(true)}
          className="hidden sm:inline-flex"
        >
          <Icons.key className="h-3.5 w-3.5" aria-hidden="true" />
          Đặt lại mật khẩu
        </Button>
        <DropdownMenu
          trigger={
            <IconButton label={`Thao tác khác cho ${fullName}`} variant="ghost" size="sm">
              <Icons.moreVertical className="h-4 w-4" />
            </IconButton>
          }
          items={[
            {
              label: "Đặt lại mật khẩu",
              onClick: () => setConfirmReset(true),
            },
            ...statusItems,
          ]}
        />
      </div>

      {confirmReset && (
        <Dialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title={`Đặt lại mật khẩu cho ${fullName}?`}
          description="Mật khẩu tạm thời mới sẽ được sinh ra và mọi phiên đăng nhập hiện tại bị thu hồi. Người dùng phải đổi mật khẩu ở lần đăng nhập kế tiếp."
        >
          <div className="space-y-4">
            <p className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-sm">
              <span className="text-[var(--muted)]">Tài khoản:</span>{" "}
              <span className="font-mono font-semibold">{schoolMemberCode}</span>
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                Quay lại
              </Button>
              <Button
                loading={pending}
                onClick={() => {
                  setConfirmReset(false);
                  resetPassword();
                }}
              >
                Đặt lại mật khẩu
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
    </>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  GRADUATED: "Đã tốt nghiệp",
  SUSPENDED: "Tạm ngưng",
  LEFT_SCHOOL: "Đã rời trường",
};

function CredentialDialog({
  credential,
  onClose,
}: {
  credential: { code: string; password: string } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  if (!credential) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Mật khẩu tạm thời"
      description="Đây là lần duy nhất mật khẩu này được hiển thị. Hệ thống chỉ lưu bản băm, không lưu bản rõ."
    >
      <div className="space-y-4">
        <dl className="divide-y divide-[var(--hairline-soft)] rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-xs font-medium text-[var(--muted)]">Mã đăng nhập</dt>
            <dd className="font-mono text-sm font-semibold text-[var(--ink)]">{credential.code}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-xs font-medium text-[var(--muted)]">Mật khẩu tạm thời</dt>
            <dd className="font-mono text-sm font-semibold text-[var(--ink)]">
              {credential.password}
            </dd>
          </div>
        </dl>
        <Alert tone="warning" title="Bàn giao trực tiếp cho người dùng">
          Người dùng sẽ bị bắt buộc đổi mật khẩu ngay ở lần đăng nhập đầu tiên. Không gửi mật khẩu
          này qua kênh công khai.
        </Alert>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${credential.code} / ${credential.password}`);
                toast.success("Đã sao chép thông tin đăng nhập.");
              } catch {
                toast.error("Trình duyệt chặn quyền sao chép. Hãy chép thủ công.");
              }
            }}
          >
            Sao chép
          </Button>
          <Button onClick={onClose}>Tôi đã ghi lại</Button>
        </div>
      </div>
    </Dialog>
  );
}
