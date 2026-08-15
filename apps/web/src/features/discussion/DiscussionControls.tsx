"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, Select, Textarea, Input } from "@/components/ui/Field";
import {
  createThreadAction,
  replyThreadAction,
  reportPostAction,
  toggleReactionAction,
  moderateContentAction,
} from "./actions";

function useFeedback() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = <T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
    onSuccess?: (result: T) => void,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Không thể xử lý.");
      else {
        onSuccess?.(result);
        router.refresh();
      }
    });
  };
  return { isPending, error, run };
}

export function CreateThreadForm({
  forumId,
  canAnnounce,
}: {
  forumId: string;
  canAnnounce: boolean;
}) {
  const router = useRouter();
  const { isPending, error, run } = useFeedback();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("DISCUSSION");
  return (
    <div className="space-y-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4">
      <h2 className="text-sm font-semibold text-[var(--ink)]">Tạo chủ đề mới</h2>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <Field id="thread-type" label="Loại">
          <Select id="thread-type" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="DISCUSSION">Thảo luận</option>
            <option value="QUESTION">Câu hỏi</option>
            {canAnnounce ? <option value="ANNOUNCEMENT">Thông báo</option> : null}
          </Select>
        </Field>
        <Field id="thread-title" label="Tiêu đề" required>
          <Input
            id="thread-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={180}
          />
        </Field>
      </div>
      <Field id="thread-body" label="Nội dung" required>
        <Textarea
          id="thread-body"
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <Button
        type="button"
        variant="primary"
        disabled={isPending}
        onClick={() =>
          run(
            () => createThreadAction({ forumId, title, body, type }),
            (result) => {
              if ("threadId" in result) router.push(`/discussion/threads/${result.threadId}`);
            },
          )
        }
      >
        Đăng chủ đề
      </Button>
      {error ? (
        <Alert tone="danger" title="Không thể đăng">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

export function ReplyForm({ threadId }: { threadId: string }) {
  const { isPending, error, run } = useFeedback();
  const [body, setBody] = useState("");
  return (
    <div className="space-y-2 rounded-xl border border-[var(--hairline)] p-4">
      <Field id={`reply-${threadId}`} label="Viết phản hồi">
        <Textarea
          id={`reply-${threadId}`}
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Chia sẻ thông tin hữu ích và tôn trọng cộng đồng."
        />
      </Field>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={isPending || !body.trim()}
        onClick={() =>
          run(
            () => replyThreadAction(threadId, body),
            () => setBody(""),
          )
        }
      >
        Gửi phản hồi
      </Button>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function PostActions({
  postId,
  liked,
  helpful,
  likeCount,
  helpfulCount,
  canWrite,
  canReport,
}: {
  postId: string;
  liked: boolean;
  helpful: boolean;
  likeCount: number;
  helpfulCount: number;
  canWrite: boolean;
  canReport: boolean;
}) {
  const { isPending, error, run } = useFeedback();
  const [category, setCategory] = useState("spam");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={liked ? "primary" : "secondary"}
        size="sm"
        disabled={isPending || !canWrite}
        onClick={() => run(() => toggleReactionAction(postId, "LIKE"))}
      >
        Like · {likeCount}
      </Button>
      <Button
        type="button"
        variant={helpful ? "primary" : "secondary"}
        size="sm"
        disabled={isPending || !canWrite}
        onClick={() => run(() => toggleReactionAction(postId, "HELPFUL"))}
      >
        Helpful · {helpfulCount}
      </Button>
      {canReport ? (
        <details className="ml-auto">
          <summary className="cursor-pointer text-xs text-[var(--muted)]">Báo cáo</summary>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-2">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Lý do báo cáo"
            >
              <option value="harassment">Quấy rối</option>
              <option value="bullying">Bắt nạt</option>
              <option value="spam">Spam</option>
              <option value="hateful_content">Nội dung thù ghét</option>
              <option value="misinformation">Thông tin sai lệch</option>
              <option value="other">Khác</option>
            </Select>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => reportPostAction(postId, category))}
            >
              Gửi báo cáo
            </Button>
          </div>
        </details>
      ) : null}
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function ModerationControls({ reportId }: { reportId: string }) {
  const { isPending, error, run } = useFeedback();
  const [action, setAction] = useState("WARN");
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 grid gap-2 border-t border-[var(--hairline-soft)] pt-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
      <Field id={`mod-action-${reportId}`} label="Hành động">
        <Select
          id={`mod-action-${reportId}`}
          value={action}
          onChange={(event) => setAction(event.target.value)}
        >
          <option value="NO_ACTION">Không xử lý</option>
          <option value="WARN">Cảnh báo</option>
          <option value="HIDE_POST">Ẩn bài</option>
          <option value="DELETE_POST">Xóa bài</option>
          <option value="LOCK_THREAD">Khóa chủ đề</option>
          <option value="ESCALATE">Chuyển cấp</option>
        </Select>
      </Field>
      <Field id={`mod-reason-${reportId}`} label="Lý do (bắt buộc)">
        <Input
          id={`mod-reason-${reportId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={isPending}
        onClick={() =>
          run(() => moderateContentAction({ reportId, action: action as never, reason }))
        }
      >
        Ghi quyết định
      </Button>
      {error ? <p className="sm:col-span-3 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
