import type { Metadata } from "next";
import PaymentReturn from "@/components/account/payment-return";
import { AccountCard, AccountPage } from "@/components/account/shell";

export const metadata: Metadata = { title: "Payment | Tingraph" };

export default async function PaymentReturnPage({ searchParams }: PageProps<"/billing/return">) {
  const { order, provider, token } = await searchParams;
  return (
    <AccountPage>
      <AccountCard label="Premium" title="Checking your payment">
        <PaymentReturn
          order={typeof order === "string" ? order : ""}
          provider={typeof provider === "string" ? provider : ""}
          token={typeof token === "string" ? token : ""}
        />
      </AccountCard>
    </AccountPage>
  );
}
