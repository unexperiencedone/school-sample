import { randomId } from "../crypto";
import type { EmailAdapter, SendResult } from "./types";

/** No network. The notify layer has already written the message to the Outbox table; viewable at /admin/outbox. */
export class MockEmailAdapter implements EmailAdapter {
  readonly name = "mock";
  readonly mode = "MOCK" as const;
  async send(): Promise<SendResult> {
    return { providerMessageId: randomId("mock_email") };
  }
}
