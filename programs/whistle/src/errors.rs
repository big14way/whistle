use anchor_lang::prelude::*;

/// All Whistle program errors. Messages are plain language so the frontend can
/// decode an Anchor error code straight into a readable toast.
#[error_code]
pub enum WhistleError {
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market is locked, no more bets")]
    MarketLocked,
    #[msg("Too early to settle this market")]
    TooEarlyToSettle,
    #[msg("Too early to void this market")]
    TooEarlyToVoid,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Proof fixture id does not match the market")]
    FixtureMismatch,
    #[msg("Proof stat key does not match the market predicate")]
    StatKeyMismatch,
    #[msg("This market needs a second stat, none was supplied")]
    MissingSecondStat,
    #[msg("This market is single stat, a second stat was supplied")]
    UnexpectedSecondStat,
    #[msg("Invalid comparison for this market")]
    InvalidComparison,
    #[msg("Invalid market timing parameters")]
    InvalidTiming,
    #[msg("The predicate was not proven by the oracle")]
    PredicateNotProven,
    #[msg("The oracle returned no data")]
    NoOracleReturn,
    #[msg("Return data came from the wrong program")]
    WrongOracleReturn,
    #[msg("Could not decode the oracle return value")]
    BadOracleReturn,
    #[msg("Nothing to claim for this position")]
    NothingToClaim,
    #[msg("This position has already been claimed")]
    AlreadyClaimed,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Title is longer than 64 bytes")]
    TitleTooLong,
    #[msg("A two stat market requires a binary operator")]
    MissingOperator,
    #[msg("Second stat key must not be zero")]
    ZeroSecondStatKey,
}
