use anchor_lang::prelude::*;

use crate::oracle::{
    cpi_validate_stat, ProofNodeArg, ScoresBatchSummaryArg, StatTermArg,
};
use crate::state::{BinaryOp, Comparison};
use crate::txoracle;

/// Milestone 0 gate instruction. Performs the validate_stat CPI in isolation and
/// logs the returned boolean, so a real .rpc() transaction (not just .view())
/// proves the CPI works end to end and reveals the false vs abort behavior. This
/// is the de-risk probe; it carries no betting logic and could be removed once
/// the headline settle path is proven on the chosen cluster.
///
/// Unlike settle, the predicate here is the literal (threshold, comparison) the
/// caller passes, with no negation, so the probe can deliberately submit a
/// satisfied predicate (expect true) and an unsatisfiable one (expect false or
/// an abort) to record the behavior.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProbeArgs {
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummaryArg,
    pub fixture_proof: Vec<ProofNodeArg>,
    pub main_tree_proof: Vec<ProofNodeArg>,
    pub threshold: i32,
    pub comparison: Comparison,
    pub stat_a: StatTermArg,
    pub stat_b: Option<StatTermArg>,
    pub op: Option<BinaryOp>,
}

#[derive(Accounts)]
pub struct ProbeValidate<'info> {
    /// CHECK: read only daily_scores_roots PDA, validated by the proof itself.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    /// CHECK: the txoracle program, pinned by address.
    #[account(address = txoracle::ID)]
    pub txoracle_program: UncheckedAccount<'info>,

    pub settler: Signer<'info>,
}

pub fn handler(ctx: Context<ProbeValidate>, args: ProbeArgs) -> Result<()> {
    let verified = cpi_validate_stat(
        ctx.accounts.txoracle_program.to_account_info(),
        ctx.accounts.daily_scores_merkle_roots.to_account_info(),
        args.ts,
        &args.fixture_summary,
        &args.fixture_proof,
        &args.main_tree_proof,
        args.threshold,
        args.comparison,
        &args.stat_a,
        &args.stat_b,
        args.op,
    )?;
    // Do not require! here: the probe wants to observe a false return distinctly
    // from an abort, so it just logs.
    msg!("probe_validate: validate_stat returned {}", verified);
    Ok(())
}
