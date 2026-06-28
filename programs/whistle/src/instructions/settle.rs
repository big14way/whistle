use anchor_lang::prelude::*;

use crate::errors::WhistleError;
use crate::oracle::{
    cpi_validate_stat, predicate_for_claim, ProofNodeArg, ScoresBatchSummaryArg, StatTermArg,
};
use crate::state::{Market, MarketSettled, MarketState, MARKET_SEED};
use crate::txoracle;

/// Settle arguments. The settler supplies only proof material and the side they
/// claim won. They never supply the predicate: the contract builds it from the
/// stored market fields. A settler cannot set a wrong outcome.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleArgs {
    /// true = YES (predicate satisfied), false = NO (its negation).
    pub claimed_winner: bool,
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummaryArg,
    pub fixture_proof: Vec<ProofNodeArg>,
    pub main_tree_proof: Vec<ProofNodeArg>,
    pub stat_a: StatTermArg,
    pub stat_b: Option<StatTermArg>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.fixture.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// CHECK: the daily_scores_roots PDA on the txoracle program. Passed through
    /// read only. We do not derive it in program (find_program_address is compute
    /// heavy); the Merkle proof is the real guard. A wrong roots account makes
    /// validate_stat fail, so a bad account can never settle a market.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    /// CHECK: the TxLINE txoracle program, pinned by address to the id from its IDL.
    #[account(address = txoracle::ID)]
    pub txoracle_program: UncheckedAccount<'info>,

    /// Permissionless. Anyone may settle; the settler only pays fees.
    pub settler: Signer<'info>,
}

pub fn handler(ctx: Context<Settle>, args: SettleArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // 1. State and timing.
    {
        let market = &ctx.accounts.market;
        require!(market.state == MarketState::Open, WhistleError::MarketNotOpen);
        require!(
            now >= market.resolve_after_ts,
            WhistleError::TooEarlyToSettle
        );
    }

    // Snapshot the immutable predicate fields we need for the CPI.
    let m_fixture_id = ctx.accounts.market.fixture_id;
    let m_stat_a_key = ctx.accounts.market.stat_a_key;
    let m_stat_a_period = ctx.accounts.market.stat_a_period;
    let m_stat_b_key = ctx.accounts.market.stat_b_key;
    let m_stat_b_period = ctx.accounts.market.stat_b_period;
    let m_has_stat_b = ctx.accounts.market.has_stat_b;
    let m_op = ctx.accounts.market.op;
    let m_threshold = ctx.accounts.market.threshold;
    let m_comparison = ctx.accounts.market.comparison;

    // 2. Bind the proof to the right match.
    require!(
        args.fixture_summary.fixture_id == m_fixture_id,
        WhistleError::FixtureMismatch
    );

    // 3. Bind the proof to the right stat(s), including the period. The oracle
    // leaf carries an independent period field; binding only the key would let a
    // settler prove the same key under a different period to flip the outcome, so
    // the period is pinned to the stored market value too.
    require!(
        args.stat_a.stat_to_prove.key == m_stat_a_key,
        WhistleError::StatKeyMismatch
    );
    require!(
        args.stat_a.stat_to_prove.period == m_stat_a_period,
        WhistleError::StatKeyMismatch
    );
    if m_has_stat_b {
        let stat_b = args.stat_b.as_ref().ok_or(WhistleError::MissingSecondStat)?;
        require!(
            stat_b.stat_to_prove.key == m_stat_b_key,
            WhistleError::StatKeyMismatch
        );
        require!(
            stat_b.stat_to_prove.period == m_stat_b_period,
            WhistleError::StatKeyMismatch
        );
    } else {
        require!(args.stat_b.is_none(), WhistleError::UnexpectedSecondStat);
    }

    // 4. Build the predicate in program. Never trust a settler supplied predicate.
    let (threshold, comparison) = predicate_for_claim(m_threshold, m_comparison, args.claimed_winner)?;
    let op = if m_has_stat_b { Some(m_op) } else { None };

    // Values for the proof receipt event (the proven stat values).
    let value_a = args.stat_a.stat_to_prove.value;
    let value_b = args
        .stat_b
        .as_ref()
        .map(|s| s.stat_to_prove.value)
        .unwrap_or(0);

    // 5 and 6. CPI validate_stat and read the boolean. If the claim is wrong the
    // predicate is false, so this either returns false (require fails) or the CPI
    // aborts (whole tx fails). Either way market state is untouched.
    let verified = cpi_validate_stat(
        ctx.accounts.txoracle_program.to_account_info(),
        ctx.accounts.daily_scores_merkle_roots.to_account_info(),
        args.ts,
        &args.fixture_summary,
        &args.fixture_proof,
        &args.main_tree_proof,
        threshold,
        comparison,
        &args.stat_a,
        &args.stat_b,
        op,
    )?;
    require!(verified, WhistleError::PredicateNotProven);

    // 7 and 8. Resolve the market.
    let market = &mut ctx.accounts.market;
    let winning_pool = if args.claimed_winner {
        market.total_yes
    } else {
        market.total_no
    };

    if winning_pool == 0 {
        // Nobody backed the side that won. Void so everyone refunds and the losing
        // side's funds are not stranded. This also avoids a divide by zero in claim.
        market.state = MarketState::Voided;
    } else if args.claimed_winner {
        market.state = MarketState::SettledYes;
    } else {
        market.state = MarketState::SettledNo;
    }

    emit!(MarketSettled {
        market: market.key(),
        fixture_id: market.fixture_id,
        stat_a_key: market.stat_a_key,
        stat_b_key: market.stat_b_key,
        has_stat_b: market.has_stat_b,
        value_a,
        value_b,
        threshold: market.threshold,
        comparison: market.comparison,
        op: market.op,
        claimed_winner: args.claimed_winner,
        state: market.state,
        total_yes: market.total_yes,
        total_no: market.total_no,
    });

    msg!(
        "Settled market {}: state {:?} (claimed_winner {})",
        market.market_id,
        market.state,
        args.claimed_winner
    );
    Ok(())
}
