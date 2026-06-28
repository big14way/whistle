use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::WhistleError;
use crate::state::{
    Market, MarketState, Position, MARKET_SEED, POSITION_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED,
};

/// Claim a payout (or a refund when the market is Voided). Pure deterministic
/// parimutuel arithmetic, signed out of the vault by the vault_authority PDA.
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        seeds = [MARKET_SEED, market.fixture.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [POSITION_SEED, market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        constraint = position.user == user.key() @ WhistleError::NothingToClaim,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = market.stake_mint,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: vault authority PDA, signs the payout via invoke_signed.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump = market.vault_authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = market.stake_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    // Snapshot market fields (market is not mutated here).
    let state = ctx.accounts.market.state;
    let total_yes = ctx.accounts.market.total_yes as u128;
    let total_no = ctx.accounts.market.total_no as u128;
    let fee_bps = ctx.accounts.market.fee_bps as u128;
    let market_key = ctx.accounts.market.key();
    let vault_auth_bump = ctx.accounts.market.vault_authority_bump;

    require!(!ctx.accounts.position.claimed, WhistleError::AlreadyClaimed);
    require!(
        matches!(
            state,
            MarketState::SettledYes | MarketState::SettledNo | MarketState::Voided
        ),
        WhistleError::MarketNotOpen
    );

    let yes_amount = ctx.accounts.position.yes_amount;
    let no_amount = ctx.accounts.position.no_amount;

    let payout: u64 = match state {
        MarketState::Voided => {
            // Full refund of both sides, no fee.
            yes_amount
                .checked_add(no_amount)
                .ok_or(WhistleError::MathOverflow)?
        }
        MarketState::SettledYes | MarketState::SettledNo => {
            let winning_stake: u128 = if state == MarketState::SettledYes {
                yes_amount as u128
            } else {
                no_amount as u128
            };
            require!(winning_stake > 0, WhistleError::NothingToClaim);

            let total_pot = total_yes
                .checked_add(total_no)
                .ok_or(WhistleError::MathOverflow)?;
            // Guaranteed greater than zero: settle voids when the winning pool is empty.
            let winning_pool = if state == MarketState::SettledYes {
                total_yes
            } else {
                total_no
            };

            let gross = winning_stake
                .checked_mul(total_pot)
                .ok_or(WhistleError::MathOverflow)?
                .checked_div(winning_pool)
                .ok_or(WhistleError::MathOverflow)?;
            let fee = gross
                .checked_mul(fee_bps)
                .ok_or(WhistleError::MathOverflow)?
                .checked_div(10_000)
                .ok_or(WhistleError::MathOverflow)?;
            let net = gross.checked_sub(fee).ok_or(WhistleError::MathOverflow)?;
            u64::try_from(net).map_err(|_| WhistleError::MathOverflow)?
        }
        MarketState::Open => return err!(WhistleError::MarketNotOpen),
    };

    require!(payout > 0, WhistleError::NothingToClaim);

    // Transfer the payout out of the vault, signed by the vault_authority PDA.
    let signer_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, market_key.as_ref(), &[vault_auth_bump]];
    let signer = &[signer_seeds];
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        ),
        payout,
    )?;

    ctx.accounts.position.claimed = true;
    msg!("Claimed {} from market {}", payout, market_key);
    Ok(())
}
