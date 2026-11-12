import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({
      ok: true,
      mode: "local",
      message: "Supabase not configured yet; local storage active.",
    });
  }

  try {
    // Ultra-lightweight query (1 row, 1 column) just to register activity in Supabase
    const { error } = await supabase
      .from("test_configs")
      .select("id")
      .limit(1);

    return NextResponse.json({
      ok: !error,
      pingedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
