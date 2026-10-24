// Student-facing name is "credits". The database column, the increment_usage
// RPC and the /api/usage JSON still say token — those are wire and schema
// names with callers outside this file, and renaming them would be a
// coordinated change for no behavioural gain. Nothing a student reads says
// "token".
//
// Values are unchanged from the token-named constants they replace.
export const WEEKLY_CREDIT_LIMIT = 20;
export const CREDIT_COST_SUBJECTIVE = 1;
export const CREDIT_COST_OBJECTIVE = 0;

// Referral program (src/lib/referrals). Both the inviter and the invited
// student get REFERRAL_WEEKLY_BONUS added to their weekly limit, permanently,
// once the friend has REFERRAL_QUALIFY_AT written answers marked. Bonuses from
// every source stack up to MAX_WEEKLY_BONUS; an inviter is rewarded for at most
// MAX_REWARDED_REFERRALS friends (more still count on /invite, for no credits).
export const REFERRAL_WEEKLY_BONUS = 5;
export const REFERRAL_QUALIFY_AT = 2;
export const MAX_WEEKLY_BONUS = 50;
export const MAX_REWARDED_REFERRALS = 10;
