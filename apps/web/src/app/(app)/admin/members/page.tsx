import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/PageHeader";

export default async function MembersPage() {
  const actor = await requireRoute("/admin/members");
  const members = await db.schoolMembership.findMany({
    where: { tenantId: actor.tenantId },
    include: { user: { include: { roles: true } } },
    take: 40,
  });
  return (
    <div>
      <PageHeader
        title="Thành viên"
        description="Username = school_member_code. ID nội bộ là UUID."
      />
      <form className="mb-6 rounded-xl border border-dashed border-[var(--line)] p-4 text-sm">
        Import Excel (full_name, class, school_member_code, member_type)
        <input type="file" name="file" accept=".xlsx" className="mt-2 block" />
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th>Mã</th>
            <th>Tên</th>
            <th>TT</th>
            <th>Vai trò</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-[var(--line)]">
              <td className="py-2">{m.schoolMemberCode}</td>
              <td>{m.user.fullName}</td>
              <td>{m.membershipStatus}</td>
              <td>{m.user.roles.map((r) => r.role).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
