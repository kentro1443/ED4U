import { Avatar } from "@/components/ui/DataDisplay";
import { Badge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { logoutAction } from "./actions";

export interface UserSummary {
  schoolMemberCode: string;
  fullName?: string;
  roles: readonly string[];
  membershipStatus: string;
}

export function UserProfileCard({ user }: { user: UserSummary }) {
  const displayName = user.fullName || user.schoolMemberCode;
  const primaryRole = user.roles[0] || "MEMBER";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={displayName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--ink)]">{displayName}</p>
          <p className="truncate text-[11px] text-[var(--muted)]">{user.schoolMemberCode}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline-soft)] pt-2">
        <div className="flex flex-wrap gap-1">
          <Badge tone={primaryRole.includes("ADMIN") ? "dark" : "neutral"} size="sm">
            {primaryRole}
          </Badge>
          {user.membershipStatus !== "ACTIVE" && (
            <Badge tone="warning" size="sm">
              {user.membershipStatus}
            </Badge>
          )}
        </div>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            loadingLabel="Đang đăng xuất…"
            title="Đăng xuất"
            aria-label="Đăng xuất khỏi hệ thống"
            className="h-8 w-8 p-0 text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
          >
            <Icons.logout className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
