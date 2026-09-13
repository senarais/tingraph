import { NextResponse, type NextRequest } from "next/server";
import { otpType, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Where every link out of Supabase comes back to. Google returns a `code`. An
 * email link carries a `token_hash` once its template points here, or a
 * `code` if the template was left as it ships — which only works in the
 * browser that asked for the email, because the other half of that code is a
 * cookie in it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = otpType(params.get("type"));

  let failed = true;
  if (code) {
    const supabase = await createClient();
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  } else if (tokenHash && type) {
    const supabase = await createClient();
    failed = Boolean((await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error);
  }

  const to = failed ? "/login?error=link" : safeNext(params.get("next"));
  return NextResponse.redirect(new URL(to, request.url));
}
