import type { Metadata } from "next";
import DocsContent from "@/components/site/docs-content";

export const metadata: Metadata = { title: "Documentation | Tingraph", description: "Start here: learn Tingraph, follow a first-diagram tutorial, and explore complete syntax guides and AI prompts for every notation." };

export default function DocsOverview() {
  return <DocsContent slug="overview" />;
}
