//! TxLINE txoracle CPI glue.
//!
//! Whistle defines its own mirror structs for the proof material so that the
//! Whistle IDL fully describes the settle arguments (no dependency on the
//! generated txoracle types leaking into Whistle's own IDL). At CPI time these
//! mirrors are mapped field for field into the txoracle types produced by
//! declare_program!(txoracle), and validate_stat is invoked. The returned bool
//! is read back with the version independent get_return_data pattern.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::get_return_data;

use crate::errors::WhistleError;
use crate::state::{BinaryOp, Comparison};
use crate::txoracle;

/// Mirror of txoracle ProofNode.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProofNodeArg {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

/// Mirror of txoracle ScoresUpdateStats.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresUpdateStatsArg {
    pub update_count: i32,
    /// Milliseconds. epochDay for the daily_scores_roots PDA is floor(min_timestamp / 86_400_000).
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

/// Mirror of txoracle ScoresBatchSummary.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresBatchSummaryArg {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStatsArg,
    pub events_sub_tree_root: [u8; 32],
}

/// Mirror of txoracle ScoreStat.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoreStatArg {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

/// Mirror of txoracle StatTerm.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StatTermArg {
    pub stat_to_prove: ScoreStatArg,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNodeArg>,
}

fn to_oracle_node(n: &ProofNodeArg) -> txoracle::types::ProofNode {
    txoracle::types::ProofNode {
        hash: n.hash,
        is_right_sibling: n.is_right_sibling,
    }
}

fn to_oracle_statterm(s: &StatTermArg) -> txoracle::types::StatTerm {
    txoracle::types::StatTerm {
        stat_to_prove: txoracle::types::ScoreStat {
            key: s.stat_to_prove.key,
            value: s.stat_to_prove.value,
            period: s.stat_to_prove.period,
        },
        event_stat_root: s.event_stat_root,
        stat_proof: s.stat_proof.iter().map(to_oracle_node).collect(),
    }
}

pub fn map_comparison(c: Comparison) -> txoracle::types::Comparison {
    match c {
        Comparison::GreaterThan => txoracle::types::Comparison::GreaterThan,
        Comparison::LessThan => txoracle::types::Comparison::LessThan,
    }
}

pub fn map_op(op: BinaryOp) -> txoracle::types::BinaryExpression {
    match op {
        BinaryOp::Add => txoracle::types::BinaryExpression::Add,
        BinaryOp::Subtract => txoracle::types::BinaryExpression::Subtract,
    }
}

/// Build the (threshold, comparison) the oracle must prove for the claimed side.
///
/// claimed == true uses the market predicate as stored. claimed == false uses
/// the logical negation:
///   not(x > T) is x <= T which is x < T + 1, so GreaterThan(T) -> LessThan(T + 1)
///   not(x < T) is x >= T which is x > T - 1, so LessThan(T) -> GreaterThan(T - 1)
/// The two predicates partition every integer, so exactly one side is provable
/// and there are no pushes. Checked arithmetic guards the i32 edges.
pub fn predicate_for_claim(
    threshold: i32,
    comparison: Comparison,
    claimed: bool,
) -> Result<(i32, Comparison)> {
    if claimed {
        return Ok((threshold, comparison));
    }
    match comparison {
        Comparison::GreaterThan => {
            let t = threshold
                .checked_add(1)
                .ok_or(WhistleError::MathOverflow)?;
            Ok((t, Comparison::LessThan))
        }
        Comparison::LessThan => {
            let t = threshold
                .checked_sub(1)
                .ok_or(WhistleError::MathOverflow)?;
            Ok((t, Comparison::GreaterThan))
        }
    }
}

/// Read back the bool that validate_stat set as return data. Version independent:
/// works whether the generated cpi returns the value or only Result<()>.
pub fn read_oracle_bool(expected_program: &Pubkey) -> Result<bool> {
    let (returning_program, data) =
        get_return_data().ok_or(WhistleError::NoOracleReturn)?;
    require_keys_eq!(
        returning_program,
        *expected_program,
        WhistleError::WrongOracleReturn
    );
    let verified = bool::try_from_slice(&data).map_err(|_| WhistleError::BadOracleReturn)?;
    Ok(verified)
}

/// Map the mirror args into txoracle types, CPI into validate_stat, and return
/// the proven bool. The predicate (threshold, comparison) is built by the caller
/// from stored market fields, never from settler input.
#[allow(clippy::too_many_arguments)]
pub fn cpi_validate_stat<'info>(
    txoracle_program: AccountInfo<'info>,
    daily_scores_merkle_roots: AccountInfo<'info>,
    ts: i64,
    summary: &ScoresBatchSummaryArg,
    fixture_proof: &[ProofNodeArg],
    main_tree_proof: &[ProofNodeArg],
    threshold: i32,
    comparison: Comparison,
    stat_a: &StatTermArg,
    stat_b: &Option<StatTermArg>,
    op: Option<BinaryOp>,
) -> Result<bool> {
    let fixture_summary = txoracle::types::ScoresBatchSummary {
        fixture_id: summary.fixture_id,
        update_stats: txoracle::types::ScoresUpdateStats {
            update_count: summary.update_stats.update_count,
            min_timestamp: summary.update_stats.min_timestamp,
            max_timestamp: summary.update_stats.max_timestamp,
        },
        events_sub_tree_root: summary.events_sub_tree_root,
    };
    let f_proof: Vec<txoracle::types::ProofNode> = fixture_proof.iter().map(to_oracle_node).collect();
    let m_proof: Vec<txoracle::types::ProofNode> =
        main_tree_proof.iter().map(to_oracle_node).collect();
    let predicate = txoracle::types::TraderPredicate {
        threshold,
        comparison: map_comparison(comparison),
    };
    let stat_a_oracle = to_oracle_statterm(stat_a);
    let stat_b_oracle = stat_b.as_ref().map(to_oracle_statterm);
    let op_oracle = op.map(map_op);

    let program_key = txoracle_program.key();
    let cpi_accounts = txoracle::cpi::accounts::ValidateStat {
        daily_scores_merkle_roots,
    };
    let cpi_ctx = CpiContext::new(txoracle_program, cpi_accounts);

    // The CPI sets return data with a Borsh serialized bool. If the proof is
    // invalid or a failure path aborts, this returns Err and the whole
    // transaction fails (which is the safe outcome). We discard the direct
    // return value and read the bool back robustly below.
    let _ = txoracle::cpi::validate_stat(
        cpi_ctx,
        ts,
        fixture_summary,
        f_proof,
        m_proof,
        predicate,
        stat_a_oracle,
        stat_b_oracle,
        op_oracle,
    )?;

    read_oracle_bool(&program_key)
}
