import { randomId } from "../crypto";
import { requireEnv } from "../errors";
import { basicAuth, providerFetch } from "../payments/http";
import type { SendResult, SmsAdapter, SmsMessage } from "./types";

export class MockSmsAdapter implements SmsAdapter {
  readonly name = "mock";
  readonly mode = "MOCK" as const;
  async send(): Promise<SendResult> {
    return { providerMessageId: randomId("mock_sms") };
  }
}

/** MSG91 Flow API (DLT templates). POST https://control.msg91.com/api/v5/flow/ header `authkey`. */
export class Msg91Adapter implements SmsAdapter {
  readonly name = "msg91";
  readonly mode = "LIVE" as const;
  async send(m: SmsMessage): Promise<SendResult> {
    const [authkey, sender] = requireEnv("MSG91", ["MSG91_AUTH_KEY", "MSG91_SENDER_ID"]);
    const res = await providerFetch<{ message: string; type: string }>(
      "MSG91",
      "https://control.msg91.com/api/v5/flow/",
      {
        method: "POST",
        headers: { authkey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          template_id: m.templateId,
          sender,
          short_url: "0",
          recipients: [{ mobiles: m.to, ...m.variables }],
        }),
      },
    );
    return { providerMessageId: res.message };
  }
}

/** Twilio Messages API. POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json */
export class TwilioAdapter implements SmsAdapter {
  readonly name = "twilio";
  readonly mode = "LIVE" as const;
  async send(m: SmsMessage): Promise<SendResult> {
    const [sid, token, from] = requireEnv("Twilio", [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_FROM",
    ]);
    const res = await providerFetch<{ sid: string }>(
      "Twilio",
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(sid, token),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: `+${m.to}`, From: from, Body: m.text }).toString(),
      },
    );
    return { providerMessageId: res.sid };
  }
}
