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
