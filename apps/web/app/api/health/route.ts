import { NextResponse } from "next/server";

// Required for `output: "export"` static build — marks this as a static route
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ ok: true });
}
