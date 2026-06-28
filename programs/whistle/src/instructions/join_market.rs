use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::WhistleError;
use crate::state::{Market, MarketState, Position, MARKET_SEED, POSITION_SEED, VAULT_SEED};

/// Place a bet on one side of a market. side == true is YES (predicate satisfied),
/// side == false is NO (the negation). USDC moves from the bettor into the vault.
#[derive(Accounts)]
pub struct JoinMarket<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.fixture.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = market.stake_mint,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = market.stake_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JoinMarket>, side: bool, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    {
        let market = &ctx.accounts.market;
        require!(market.state == MarketState::Open, WhistleError::MarketNotOpen);
        require!(now < market.lock_ts, WhistleError::MarketLocked);
    }
    require!(amount > 0, WhistleError::ZeroAmount);

    // Move the stake into the vault, signed by the user.
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        amount,
    )?;

    // Initialize the position on first use.
    let market_key = ctx.accounts.market.key();
    let user_key = ctx.accounts.user.key();
    let position = &mut ctx.accounts.position;
    if position.market == Pubkey::default() {
        position.market = market_key;
        position.user = user_key;
        position.claimed = false;
        position.bump = ctx.bumps.position;
    }

    // Record the stake on the chosen side, with checked math.
    let market = &mut ctx.accounts.market;
    if side {
        position.yes_amount = position
            .yes_amount
            .checked_add(amount)
            .ok_or(WhistleError::MathOverflow)?;
        market.total_yes = market
            .total_yes
            .checked_add(amount)
            .ok_or(WhistleError::MathOverflow)?;
    } else {
        position.no_amount = position
            .no_amount
            .checked_add(amount)
            .ok_or(WhistleError::MathOverflow)?;
        market.total_no = market
            .total_no
            .checked_add(amount)
            .ok_or(WhistleError::MathOverflow)?;
    }

    msg!(
        "Joined market {} side {} amount {}",
        market.market_id,
        if side { "YES" } else { "NO" },
        amount
    );
    Ok(())
}
