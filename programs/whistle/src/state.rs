use anchor_lang::prelude::*;

/// PDA seed prefixes. Kept here so the program, scripts, and frontend agree.
pub const FIXTURE_SEED: &[u8] = b"fixture";
pub const MARKET_SEED: &[u8] = b"market";
pub const POSITION_SEED: &[u8] = b"position";
pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";

/// Whistle's own comparison operator.
///
/// EqualTo is intentionally excluded: the logical negation of EqualTo is not a
/// single comparison, so an EqualTo market could not resolve a losing side
/// cleanly. GreaterThan and LessThan are complementary under negation and
/// partition every integer, so exactly one side of a market is always provable.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Comparison {
    GreaterThan,
    LessThan,
}

/// Binary operator for two stat markets. value_a op value_b is compared to the
/// threshold. Maps to txoracle::types::BinaryExpression at CPI time.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum BinaryOp {
    Add,
    Subtract,
}

/// Lifecycle of a single market.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MarketState {
    Open,
    SettledYes,
    SettledNo,
    Voided,
}

/// Per match container, the "Match Vault". Anyone may create one.
/// Seeds: ["fixture", fixture_id.to_le_bytes()].
#[account]
#[derive(InitSpace)]
pub struct Fixture {
    pub fixture_id: i64,
    /// Creator of the fixture container (not a privileged resolver).
    pub authority: Pubkey,
    /// Next market index. The next created market must use this as its market_id.
    pub market_count: u32,
    pub bump: u8,
}

/// One parimutuel prop market over a TxLINE stat predicate.
/// Seeds: ["market", fixture.key(), market_id.to_le_bytes()].
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// The Fixture PDA this market belongs to.
    pub fixture: Pubkey,
    /// Duplicated from the fixture so settle can bind proof material to the match
    /// without loading the fixture account.
    pub fixture_id: i64,
    pub market_id: u32,
    pub creator: Pubkey,
    /// Stake mint (the mock USDC mint on devnet).
    pub stake_mint: Pubkey,
    /// Bump for the vault_authority PDA, stored so claim can sign payouts.
    pub vault_authority_bump: u8,

    // Predicate definition (the question). Period is encoded inside the stat keys.
    pub stat_a_key: u32,
    /// 0 when single stat. See has_stat_b.
    pub stat_b_key: u32,
    pub has_stat_b: bool,
    /// Meaningful only when has_stat_b is true.
    pub op: BinaryOp,
    pub threshold: i32,
    pub comparison: Comparison,

    // Timing (unix seconds).
    /// No joins at or after this (kickoff or period start).
    pub lock_ts: i64,
    /// No settle before this (when the stat is final).
    pub resolve_after_ts: i64,
    /// Anyone may void if still Open at or after this.
    pub void_after_ts: i64,

    // Pools (base units of the stake mint).
    pub total_yes: u64,
    pub total_no: u64,

    pub state: MarketState,
    /// Parimutuel fee in basis points. MVP keeps this at 0 but the field and the
    /// claim math are wired for later.
    pub fee_bps: u16,
    /// Short display label.
    #[max_len(64)]
    pub title: String,
    pub bump: u8,
}

/// One bettor's stake in a market. Created lazily on the first bet.
/// Seeds: ["position", market.key(), user.key()].
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub user: Pubkey,
    pub yes_amount: u64,
    pub no_amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

/// Emitted on a successful settle so the frontend can render a proof receipt.
#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub fixture_id: i64,
    pub stat_a_key: u32,
    pub stat_b_key: u32,
    pub has_stat_b: bool,
    /// Proven value of stat A (from stat_a.stat_to_prove.value).
    pub value_a: i32,
    /// Proven value of stat B, or 0 for single stat markets.
    pub value_b: i32,
    pub threshold: i32,
    pub comparison: Comparison,
    pub op: BinaryOp,
    /// The side the settler claimed (true = YES).
    pub claimed_winner: bool,
    pub state: MarketState,
    pub total_yes: u64,
    pub total_no: u64,
}
