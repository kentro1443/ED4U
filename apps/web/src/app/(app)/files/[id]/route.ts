import { NextResponse } from "next/server";
import { can, canViewDocument, type ClubRole, type DocVisibility } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { readPrivateFile } from "@/lib/files/privateStorage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const stored = await db.storedFile.findFirst({
    where: { id, tenantId: actor.tenantId, deletedAt: null },
  });
  if (!stored) return new NextResponse("Not found", { status: 404 });

  const version = await db.applicationSubmissionVersion.findFirst({
    where: { fileId: id, application: { tenantId: actor.tenantId } },
    include: { application: true },
  });
  let allowed = false;
  if (version) {
    const application = version.application;
    allowed =
      application.studentId === actor.userId ||
      application.currentTeacherId === actor.userId ||
      application.pendingTransferTo === actor.userId ||
      (actor.roles.includes("SCHOOL_ADMIN") && can(actor, "application.review"));
  } else {
    const clubVersion = await db.clubDocumentVersion.findFirst({
      where: { fileId: id, document: { club: { tenantId: actor.tenantId } } },
      include: { document: true },
    });
    if (clubVersion) {
      const admin = actor.roles.includes("SCHOOL_ADMIN") && can(actor, "club.manage");
      const membership = await db.clubMembership.findFirst({
        where: { clubId: clubVersion.document.clubId, userId: actor.userId, status: "ACTIVE" },
      });
      allowed =
        admin ||
        (!!membership &&
          canViewDocument(
            membership.role as ClubRole,
            clubVersion.document.visibility as DocVisibility,
            false,
          ));
    }
  }
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  try {
    const bytes = await readPrivateFile(stored.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": stored.mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(stored.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Stored object missing", { status: 410 });
  }
}
