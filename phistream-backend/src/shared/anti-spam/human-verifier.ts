/**
 * Port for human-verification services (Cloudflare Turnstile, hCaptcha,
 * reCAPTCHA, Friendly Captcha, ...). Adapters live in
 * `src/providers/human-verification/` and are selected in the composition
 * root; domain code never sees which one is in use.
 *
 * No provider has been chosen yet, so none is wired by default.
 */
export interface HumanVerificationInput {
  /** Token produced by the provider's frontend widget. */
  readonly token: string;
  /** Client IP, which most providers accept as an extra signal. */
  readonly remoteIp: string;
  /** Form/action name; adapters should compare it with the widget's action. */
  readonly action: string;
}

export interface HumanVerificationResult {
  readonly success: boolean;
}

export interface HumanVerifier {
  /** Provider identifier for logs, e.g. "turnstile". */
  readonly provider: string;
  /**
   * Resolves `{ success: false }` for an invalid, expired, or reused token.
   * Throws only when the provider cannot be reached or answers unexpectedly.
   */
  verify(input: HumanVerificationInput): Promise<HumanVerificationResult>;
}
