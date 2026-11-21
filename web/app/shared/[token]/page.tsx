import type { Metadata } from "next";
import SharedShell from "@/components/shared/shared-shell";

// the address is the key to someone's diagram: never indexed, never sent on
// as a Referer to anything the page links to
export const metadata: Metadata = {
  title: "Shared diagram | Tingraph",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** A diagram opened through its shared link: view-only, or editable for a signed-in reader. */
export default async function SharedPage({ params }: PageProps<"/shared/[token]">) {
  const { token } = await params;
  return <SharedShell key={token} token={token} />;
}
