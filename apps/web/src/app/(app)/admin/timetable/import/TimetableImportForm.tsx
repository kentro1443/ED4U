"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TimetableIssue } from "@ed4u/domain";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { importTimetableAction } from "../actions";

export interface SemesterOption {
  id: string;
  label: string;
  existingEntries: number;
}

export function TimetableImportForm({ semesters }: { semesters: SemesterOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [semesterId, setSemesterId] = useState(semesters[0]?.id ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [issues, setIssues] = useState<TimetableIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = semesters.find((semester) => semester.id === semesterId);

  function submit(formData: FormData) {
    setIssues([]);
    setError(null);
    startTransition(async () => {
      const result = await importTimetableAction(formData);
      if (!result.ok) {
        setIssues(result.issues);
        setError(result.error ?? null);
        toast.error(
          result.issues.length > 0
            ? `Từ chối toàn bộ tệp: ${result.issues.length} lỗi.`
            : (result.error ?? "Không thể nhập thời khóa biểu."),
        );
        return;
      }
      toast.success(
        `Đã nhập ${result.imported} tiết học${
          result.replaced > 0 ? `, thay thế ${result.replaced} tiết cũ` : ""
        }.`,
      );
      setFileName(null);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <form action={submit} className="space-y-4">
        <Field
          id="timetable-semester"
          label="Học kỳ áp dụng"
          required
          description="Toàn bộ tiết học hiện có của học kỳ này sẽ bị thay thế bằng nội dung tệp."
        >
          <Select
            id="timetable-semester"
            name="semesterId"
            value={semesterId}
            onChange={(event) => setSemesterId(event.target.value)}
            required
          >
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="timetable-file" label="Tệp CSV" required>
          <input
            id="timetable-file"
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
            className="w-full cursor-pointer text-xs text-[var(--muted)] file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-[var(--hairline)] file:bg-[var(--canvas)] file:px-3 file:py-2 file:text-xs file:font-semibold hover:file:bg-[var(--surface-soft)]"
          />
        </Field>

        {selected && selected.existingEntries > 0 && (
          <Alert tone="warning" title="Học kỳ này đã có thời khóa biểu">
            {selected.existingEntries} tiết học hiện tại sẽ bị xóa và thay bằng nội dung tệp. Thao
            tác nằm trong một giao dịch: nếu tệp bị từ chối, dữ liệu cũ được giữ nguyên.
          </Alert>
        )}

        {error && (
          <Alert tone="danger" title="Không thể nhập thời khóa biểu">
            {error}
          </Alert>
        )}

        {issues.length > 0 && (
          <Alert tone="danger" title={`Đã từ chối toàn bộ tệp · ${issues.length} lỗi`}>
            <p className="mb-2">
              Không có thay đổi nào được ghi. Sửa các dòng dưới đây rồi tải lại tệp.
            </p>
            <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-[11px]">
              {issues.slice(0, 50).map((issue, index) => (
                <li key={`${issue.line}-${issue.column}-${index}`}>
                  Dòng {issue.line} · {issue.column}: {issue.message}
                </li>
              ))}
            </ul>
            {issues.length > 50 && <p className="mt-2">…và {issues.length - 50} lỗi khác.</p>}
          </Alert>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={!fileName || !semesterId}>
            Kiểm tra & thay thế học kỳ
          </Button>
        </div>
      </form>
    </Card>
  );
}
