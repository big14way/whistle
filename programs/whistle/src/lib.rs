//! Whistle: trustless parametric prop settlement on Solana.
//!
//! Every market is a predicate over a real match statistic from the TxLINE oracle.
//! Bettors lock USDC into a program owned vault. The instant the stat is anchored
//! on chain, anyone may settle: the program does a CPI into TxLINE validate_stat,
//! which verifies the stat against the on chain Merkle root and returns a bool.
//! The winning side is paid pro rata from the parimutuel pool. No dispute window,
//! no central resolver, no trusted admin. The proof is the authorization.

// Handlers are re-exported via glob from instructions::* so the #[program] macro
// can find the generated Accounts helper modules. That makes `handler` ambiguous
// as a re-export, which is harmless since handlers are always called by full path.
#![allow(ambiguous_glob_reexports)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

// Generates the txoracle CPI client (txoracle::cpi, txoracle::types) and the
// program id constant txoracle::ID, all from programs/whistle/idls/txoracle.json.
// This eliminates hand transcription errors against the oracle interface.
declare_program!(txoracle);

pub mod errors;
pub mod oracle;
pub mod state;

pub mod instructions;
use instructions::*;

declare_id!("9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW");

#[program]
pub mod whistle {
    use super::*;

    /// Create the per match Fixture container. Permissionless.
    pub fn initialize_fixture(ctx: Context<InitializeFixture>, fixture_id: i64) -> Result<()> {
        instructions::initialize_fixture::handler(ctx, fixture_id)
    }

    /// Create a parimutuel prop market on a fixture.
    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        instructions::create_market::handler(ctx, args)
    }

    /// Place a bet on one side of a market (true = YES, false = NO).
    pub fn join_market(ctx: Context<JoinMarket>, side: bool, amount: u64) -> Result<()> {
        instructions::join_market::handler(ctx, side, amount)
    }

    /// Settle a market by proving its predicate (or the negation) through the
    /// TxLINE validate_stat CPI. Permissionless and deterministic.
    pub fn settle(ctx: Context<Settle>, args: SettleArgs) -> Result<()> {
        instructions::settle::handler(ctx, args)
    }

    /// Claim a payout, or a refund when the market is Voided.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    /// Void a market that is still Open at or after void_after_ts. Safety valve.
    pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
        instructions::void_market::handler(ctx)
    }

    /// Milestone 0 gate: prove the validate_stat CPI in isolation. Logs the bool.
    pub fn probe_validate(ctx: Context<ProbeValidate>, args: ProbeArgs) -> Result<()> {
        instructions::probe_validate::handler(ctx, args)
    }
}
