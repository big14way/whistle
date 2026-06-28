use anchor_lang::prelude::*;

use crate::errors::WhistleError;
use crate::state::{Market, MarketState, MARKET_SEED};

/// Safety valve. If a market is still Open at or after void_after_ts (abandoned or
/// coverage cancelled match, or any case where no valid proof ever arrives),
/// anyone may void it. Refunds then flow through claim()'s Voided branch.
#[derive(Accounts)]
pub struct VoidMarket<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.fixture.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    pub caller: Signer<'info>,
}

pub fn handler(ctx: Context<VoidMarket>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    require!(market.state == MarketState::Open, WhistleError::MarketNotOpen);
    require!(now >= market.void_after_ts, WhistleError::TooEarlyToVoid);
    market.state = MarketState::Voided;
    msg!("Voided market {}", market.market_id);
    Ok(())
}
