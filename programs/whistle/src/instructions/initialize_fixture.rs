use anchor_lang::prelude::*;

use crate::state::{Fixture, FIXTURE_SEED};

/// Creates the per match Fixture container. Anyone may create one. It holds no
/// funds and grants no special powers; it just namespaces a match and counts its
/// markets so market ids stay dense and collision free.
#[derive(Accounts)]
#[instruction(fixture_id: i64)]
pub struct InitializeFixture<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Fixture::INIT_SPACE,
        seeds = [FIXTURE_SEED, &fixture_id.to_le_bytes()],
        bump,
    )]
    pub fixture: Account<'info, Fixture>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeFixture>, fixture_id: i64) -> Result<()> {
    let fixture = &mut ctx.accounts.fixture;
    fixture.fixture_id = fixture_id;
    fixture.authority = ctx.accounts.authority.key();
    fixture.market_count = 0;
    fixture.bump = ctx.bumps.fixture;
    msg!("Initialized fixture {}", fixture_id);
    Ok(())
}
