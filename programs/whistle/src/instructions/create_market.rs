use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::WhistleError;
use crate::state::{
    BinaryOp, Comparison, Fixture, Market, MarketState, FIXTURE_SEED, MARKET_SEED, VAULT_AUTHORITY_SEED,
    VAULT_SEED,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketArgs {
    /// Must equal fixture.market_count.
    pub market_id: u32,
    pub stat_a_key: u32,
    /// The period the oracle leaf for stat A must carry (bound at settle).
    pub stat_a_period: i32,
    pub stat_b_key: Option<u32>,
    /// The period for stat B (required when stat_b_key is set).
    pub stat_b_period: Option<i32>,
    pub op: Option<BinaryOp>,
    pub threshold: i32,
    pub comparison: Comparison,
    pub lock_ts: i64,
    pub resolve_after_ts: i64,
    pub void_after_ts: i64,
    pub title: String,
}

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(
        mut,
        seeds = [FIXTURE_SEED, &fixture.fixture_id.to_le_bytes()],
        bump = fixture.bump,
    )]
    pub fixture: Account<'info, Fixture>,

    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, fixture.key().as_ref(), &args.market_id.to_le_bytes()],
        bump,
    )]
    pub market: Account<'info, Market>,

    /// CHECK: PDA that owns the vault token account. Derived, holds no data, signs
    /// payouts in claim via invoke_signed.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = stake_mint,
        token::authority = vault_authority,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub stake_mint: Account<'info, Mint>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
    let fixture = &mut ctx.accounts.fixture;

    // Market ids must be dense and match the fixture counter.
    require!(
        args.market_id == fixture.market_count,
        WhistleError::InvalidTiming
    );

    // Title length cap (the account reserves 64 bytes for it).
    require!(args.title.len() <= 64, WhistleError::TitleTooLong);

    // Timing invariants: lock < resolve <= void, and lock is in the future.
    let now = Clock::get()?.unix_timestamp;
    require!(args.lock_ts > now, WhistleError::InvalidTiming);
    require!(args.lock_ts < args.resolve_after_ts, WhistleError::InvalidTiming);
    require!(
        args.resolve_after_ts <= args.void_after_ts,
        WhistleError::InvalidTiming
    );

    // Predicate invariants for two stat markets.
    let has_stat_b = args.stat_b_key.is_some();
    let (stat_b_key, stat_b_period, op) = if has_stat_b {
        let key = args.stat_b_key.unwrap();
        require!(key != 0, WhistleError::ZeroSecondStatKey);
        let op = args.op.ok_or(WhistleError::MissingOperator)?;
        let period = args.stat_b_period.ok_or(WhistleError::MissingSecondStat)?;
        (key, period, op)
    } else {
        // op and stat_b_period are ignored for single stat markets; store defaults.
        (0u32, 0i32, BinaryOp::Add)
    };

    let market = &mut ctx.accounts.market;
    market.fixture = fixture.key();
    market.fixture_id = fixture.fixture_id;
    market.market_id = args.market_id;
    market.creator = ctx.accounts.creator.key();
    market.stake_mint = ctx.accounts.stake_mint.key();
    market.vault_authority_bump = ctx.bumps.vault_authority;

    market.stat_a_key = args.stat_a_key;
    market.stat_a_period = args.stat_a_period;
    market.stat_b_key = stat_b_key;
    market.stat_b_period = stat_b_period;
    market.has_stat_b = has_stat_b;
    market.op = op;
    market.threshold = args.threshold;
    market.comparison = args.comparison;

    market.lock_ts = args.lock_ts;
    market.resolve_after_ts = args.resolve_after_ts;
    market.void_after_ts = args.void_after_ts;

    market.total_yes = 0;
    market.total_no = 0;
    market.state = MarketState::Open;
    market.fee_bps = 0;
    market.title = args.title;
    market.bump = ctx.bumps.market;

    fixture.market_count = fixture
        .market_count
        .checked_add(1)
        .ok_or(WhistleError::MathOverflow)?;

    msg!(
        "Created market {} on fixture {}: \"{}\"",
        market.market_id,
        market.fixture_id,
        market.title
    );
    Ok(())
}
