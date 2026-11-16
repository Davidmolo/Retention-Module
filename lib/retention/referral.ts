export const REFERRAL_BONUS_MESSAGE = "Refer a driver and get paid $500";

export const REFERRAL_DISCLAIMER =
  "*Disclaimer: The referral bonus is payable only if the referred candidate is successfully hired by the company.";

export const REFERRAL_STATUSES = ["Open", "Hired", "Not Hired"] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export function isReferralStatus(value: string): value is ReferralStatus {
  return (REFERRAL_STATUSES as readonly string[]).includes(value);
}

export function referralMiloEmail(): string {
  return process.env.REFERRAL_MILO_EMAIL?.trim() || "milo@goxxii.com";
}
