import { NextRequest, NextResponse } from "next/server";
import { keystoneContext } from "@/features/keystone/context";
import handlePaymentProviderWebhook from "@/features/keystone/mutations/handlePaymentProviderWebhook";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerCode: string }> }
) {
  const { providerCode } = await params;
  const rawBody = await request.text();
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const headers = Object.fromEntries(request.headers.entries());
  try {
    const result = await handlePaymentProviderWebhook(
      null,
      { providerCode, event, headers, rawBody },
      keystoneContext
    );
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 400 }
    );
  }
}
