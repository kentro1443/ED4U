import { can } from "@ed4u/domain";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth";
import {
  addClubAdvisorAction,
  approveFinanceEntryAction,
  createClubEventAction,
  createFinanceEntryAction,
  joinClubAction,
  proposeClubAction,
  resolveClubEventAction,
  resolveClubMembershipAction,
  resolveClubProposalAction,
  transferClubPresidencyAction,
  voidFinanceEntryAction,
} from "@/features/clubs/actions";

const id = z.string().uuid();

const mutationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("propose-club"),
      payload: z.object({ name: z.string().max(100), description: z.string().max(1500) }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("resolve-proposal"),
      payload: z
        .object({ clubId: id, approve: z.boolean(), reason: z.string().max(1000).optional() })
        .strict(),
    })
    .strict(),
  z
    .object({ operation: z.literal("join-club"), payload: z.object({ clubId: id }).strict() })
    .strict(),
  z
    .object({
      operation: z.literal("resolve-membership"),
      payload: z.object({ membershipId: id, approve: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("transfer-presidency"),
      payload: z.object({ clubId: id, targetMembershipId: id }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("add-advisor"),
      payload: z.object({ clubId: id, teacherId: id }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("create-finance-entry"),
      payload: z
        .object({
          clubId: id,
          kind: z.enum(["INCOME", "EXPENSE"]),
          amount: z.number().int().positive().max(1_000_000_000),
          category: z.string().max(100),
          description: z.string().max(1000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("approve-finance-entry"),
      payload: z.object({ entryId: id }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("void-finance-entry"),
      payload: z.object({ entryId: id, reason: z.string().max(1000) }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("create-club-event"),
      payload: z
        .object({
          clubId: id,
          title: z.string().max(200),
          startAt: z.string().max(40),
          endAt: z.string().max(40),
          visibility: z.enum(["SCHOOL", "GRADE", "CLASS", "CLUB", "PRIVATE"]),
          roomRequired: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("resolve-club-event"),
      payload: z
        .object({ eventId: id, approve: z.boolean(), reason: z.string().max(1000).optional() })
        .strict(),
    })
    .strict(),
]);

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || !host || (fetchSite && fetchSite !== "same-origin")) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Yêu cầu không hợp lệ." }, { status: 403 });
  }

  const actor = await currentActor();
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Dữ liệu yêu cầu không hợp lệ." },
      { status: 400 },
    );
  }

  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dữ liệu yêu cầu không hợp lệ." },
      { status: 400 },
    );
  }

  if (parsed.data.operation === "propose-club" && !can(actor, "club.propose")) {
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền đề xuất CLB." },
      { status: 403 },
    );
  }
  if (parsed.data.operation === "resolve-proposal" && !can(actor, "club.manage")) {
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền quản lý CLB." },
      { status: 403 },
    );
  }

  const { operation, payload } = parsed.data;
  switch (operation) {
    case "propose-club":
      return NextResponse.json(await proposeClubAction(payload));
    case "resolve-proposal":
      return NextResponse.json(await resolveClubProposalAction(payload));
    case "join-club":
      return NextResponse.json(await joinClubAction(payload.clubId));
    case "resolve-membership":
      return NextResponse.json(await resolveClubMembershipAction(payload));
    case "transfer-presidency":
      return NextResponse.json(await transferClubPresidencyAction(payload));
    case "add-advisor":
      return NextResponse.json(await addClubAdvisorAction(payload));
    case "create-finance-entry":
      return NextResponse.json(await createFinanceEntryAction(payload));
    case "approve-finance-entry":
      return NextResponse.json(await approveFinanceEntryAction(payload.entryId));
    case "void-finance-entry":
      return NextResponse.json(await voidFinanceEntryAction(payload.entryId, payload.reason));
    case "create-club-event":
      return NextResponse.json(await createClubEventAction(payload));
    case "resolve-club-event":
      return NextResponse.json(await resolveClubEventAction(payload));
  }
}
