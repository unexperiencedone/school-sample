import { requireEnv } from "../errors";
import { SmtpEmailAdapter } from "./smtp";

/**
 * Amazon SES via its SMTP interface (no AWS SDK needed).
 * Endpoint: email-smtp.<AWS_REGION>.amazonaws.com:587. SMTP_USER/SMTP_PASS are SES SMTP credentials
 * (generated in the SES console, not IAM access keys).
 */
export class SesEmailAdapter extends SmtpEmailAdapter {
  override readonly name = "ses";
  protected override host(): string {
    const [region] = requireEnv("SES", ["AWS_REGION"]);
    return `email-smtp.${region}.amazonaws.com`;
  }
}
