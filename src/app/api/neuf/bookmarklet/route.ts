import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return new NextResponse(
    `console.log("Bookmarklet route OK"); alert("Bookmarklet route OK");`,
    {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
