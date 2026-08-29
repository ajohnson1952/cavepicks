// app/api/seed-users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

// Visit /api/seed-users?names=Jake,Mike,Tom,Alex,Sam,Chris,Pat
// Creates any names that don't already exist yet, leaves existing ones alone,
// and returns everyone's private pick link.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const namesParam = searchParams.get("names");

  if (!namesParam) {
    return NextResponse.json(
      { ok: false, error: "Pass ?names=Jake,Mike,Tom,... (comma separated, no spaces around commas needed)" },
      { status: 400 }
    );
  }

  const names = namesParam
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const results = [];
  for (const name of names) {
    let user = await prisma.user.findFirst({ where: { name } });
    if (!user) {
      const slug = crypto.randomBytes(8).toString("hex"); // 16-char random, unguessable
      user = await prisma.user.create({ data: { name, pickSlug: slug } });
    }
    results.push({ name: user.name, link: `/pick/${user.pickSlug}` });
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}
