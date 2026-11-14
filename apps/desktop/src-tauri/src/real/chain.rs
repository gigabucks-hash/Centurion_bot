//! On-chain Guard and the post-simulation balance check.
//! Neither function reads a flag from the window. A buy is allowed only when the
//! mint account itself says so, and a swap is allowed only when the simulated
//! balances show the user's own accounts changing.

use ed25519_dalek::VerifyingKey;

use super::b58;
use super::tx::{self, ResolvedIx, TxRefuse};

const TOKEN: [u8; 32] = tx::TOKEN;
const TOKEN_2022: [u8; 32] = tx::TOKEN_2022;

/// Guard default: a transfer fee at or above this (basis points) fails a buy.
const TRANSFER_FEE_BPS_FAIL: u32 = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MintView {
    pub mint_authority: Option<[u8; 32]>,
    pub freeze_authority: Option<[u8; 32]>,
    pub transfer_fee_bps: u32,
    pub permanent_delegate: bool,
    pub non_transferable: bool,
    pub transfer_hook: bool,
    pub close_authority: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum GuardFail {
    NotAMint,
    MintAuthority,
    FreezeAuthority,
    TransferFee,
    PermanentDelegate,
    NonTransferable,
    TransferHook,
    CloseAuthority,
    Extensions,
}

#[derive(Debug, Clone)]
pub struct Acct {
    pub lamports: u64,
    pub owner: [u8; 32],
    pub data: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SimFail {
    Length,
    SolLeft,
    TokenLeft,
    OwnerChanged,
    AuthorityChanged,
    NotReceived,
    Inner,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// SOL in, token out. The user must gain at least `min_out` of the output mint.
    Buy { output_mint: [u8; 32], min_out: u64, max_sol_spent: u64 },
    /// Token in, SOL out. The user's SOL must rise by at least `min_out` after the network fee.
    Sell { input_mint: [u8; 32], min_out: u64, fee_lamports: u64 },
}

fn coption(data: &[u8]) -> Option<Option<[u8; 32]>> {
    let tag = u32::from_le_bytes(data.get(..4)?.try_into().ok()?);
    match tag {
        0 => Some(None),
        1 => {
            let mut k = [0u8; 32];
            k.copy_from_slice(data.get(4..36)?);
            Some(Some(k))
        }
        _ => None,
    }
}

pub fn is_on_curve(pk: &[u8; 32]) -> bool {
    VerifyingKey::from_bytes(pk).is_ok()
}

/// Read a mint. `program` is the account's owner program. Unknown bytes fail closed.
pub fn parse_mint(program: &[u8; 32], data: &[u8]) -> Result<MintView, GuardFail> {
    if *program != TOKEN && *program != TOKEN_2022 {
        return Err(GuardFail::NotAMint);
    }
    if data.len() < 82 {
        return Err(GuardFail::NotAMint);
    }
    let mint_authority = coption(&data[0..36]).ok_or(GuardFail::NotAMint)?;
    let freeze_authority = coption(&data[46..82]).ok_or(GuardFail::NotAMint)?;
    let mut view = MintView {
        mint_authority,
        freeze_authority,
        transfer_fee_bps: 0,
        permanent_delegate: false,
        non_transferable: false,
        transfer_hook: false,
        close_authority: false,
    };
    if *program == TOKEN_2022 && data.len() > 82 {
        apply_extensions(&mut view, &data[83..])?;
    }
    Ok(view)
}

fn apply_extensions(view: &mut MintView, mut tlv: &[u8]) -> Result<(), GuardFail> {
    while tlv.len() >= 4 {
        let ty = u16::from_le_bytes([tlv[0], tlv[1]]);
        let len = u16::from_le_bytes([tlv[2], tlv[3]]) as usize;
        if ty == 0 {
            break;
        }
        if tlv.len() < 4 + len {
            return Err(GuardFail::Extensions);
        }
        let body = &tlv[4..4 + len];
        match ty {
            1 => {
                // TransferFeeConfig. The newer fee's basis points are the last two bytes.
                if body.len() < 2 {
                    return Err(GuardFail::Extensions);
                }
                let bps = u16::from_le_bytes([body[body.len() - 2], body[body.len() - 1]]);
                view.transfer_fee_bps = view.transfer_fee_bps.max(u32::from(bps));
            }
            3 => view.close_authority = true,
            6 => view.non_transferable = true,
            12 => view.permanent_delegate = true,
            14 => view.transfer_hook = true,
            _ => {}
        }
        tlv = &tlv[4 + len..];
    }
    Ok(())
}

/// A buy. There is no `guard_pass` argument: the mint account is the only input.
pub fn guard_buy(view: &MintView) -> Result<(), GuardFail> {
    if view.mint_authority.is_some() {
        return Err(GuardFail::MintAuthority);
    }
    if view.freeze_authority.is_some() {
        return Err(GuardFail::FreezeAuthority);
    }
    if view.transfer_fee_bps >= TRANSFER_FEE_BPS_FAIL {
        return Err(GuardFail::TransferFee);
    }
    if view.permanent_delegate {
        return Err(GuardFail::PermanentDelegate);
    }
    if view.non_transferable {
        return Err(GuardFail::NonTransferable);
    }
    if view.transfer_hook {
        return Err(GuardFail::TransferHook);
    }
    if view.close_authority {
        return Err(GuardFail::CloseAuthority);
    }
    Ok(())
}

fn token_fields(data: &[u8]) -> Option<([u8; 32], [u8; 32], u64)> {
    if data.len() < 72 {
        return None;
    }
    let mut mint = [0u8; 32];
    let mut authority = [0u8; 32];
    mint.copy_from_slice(&data[0..32]);
    authority.copy_from_slice(&data[32..64]);
    let amount = u64::from_le_bytes(data[64..72].try_into().ok()?);
    Some((mint, authority, amount))
}

fn kind_of(acct: &Acct) -> Kind {
    if acct.owner != TOKEN && acct.owner != TOKEN_2022 {
        return Kind::Other;
    }
    if acct.data.len() == 165 || (acct.data.len() > 165 && acct.data.get(165) == Some(&2)) {
        return Kind::Token;
    }
    if acct.data.len() == 82 || (acct.data.len() > 82 && acct.data.get(82) == Some(&1)) {
        return Kind::Mint;
    }
    if acct.data.len() >= 165 {
        return Kind::Token;
    }
    if acct.data.len() >= 82 {
        return Kind::Mint;
    }
    Kind::Other
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Token,
    Mint,
    Other,
}

fn jito(id: &[u8; 32]) -> bool {
    const JITO: &[&str] = &[
        "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
        "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
        "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
        "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
        "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
        "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
        "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
        "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    ];
    JITO.iter().any(|s| b58::decode_exact::<32>(s).ok().as_ref() == Some(id))
}

/// `pre` and `post` are the same accounts in the same order. `None` means the account does not exist.
/// `keys[i]` is the address of `pre[i]` / `post[i]`.
pub fn check_simulation(
    keys: &[[u8; 32]],
    pre: &[Option<Acct>],
    post: &[Option<Acct>],
    user: &[u8; 32],
    tip_cap: u64,
    side: Side,
    inner: &[ResolvedIx],
) -> Result<(), SimFail> {
    if keys.len() != pre.len() || pre.len() != post.len() {
        return Err(SimFail::Length);
    }
    // Pool legs transfer tokens to vaults, so the top-level "only to the owner" rule
    // does not apply here. Authority-changing instructions are still refused, and the
    // balance diff below is what stops value leaving to another wallet.
    if inner_authority_ok(keys, inner).is_err() {
        return Err(SimFail::Inner);
    }
    let mut tips: u64 = 0;
    let mut received_out: u64 = 0;
    for i in 0..keys.len() {
        let before = &pre[i];
        let after = &post[i];
        match (before, after) {
            (None, None) => {}
            (Some(a), None) => {
                // Closed. Lamports must have gone back to the user or stayed inside a pool.
                // The balance check on the destination covers where they went.
                let _ = a;
            }
            (None, Some(b)) => {
                if !fresh_ok(&keys[i], b, user) {
                    return Err(SimFail::TokenLeft);
                }
                if let Some((mint, authority, amount)) = token_pos(b) {
                    if authority == *user && matches!(side, Side::Buy { output_mint, .. } if mint == output_mint) {
                        received_out = received_out.saturating_add(amount);
                    }
                }
            }
            (Some(a), Some(b)) => {
                if a.owner != b.owner {
                    return Err(SimFail::OwnerChanged);
                }
                if authority_bytes_changed(a, b) {
                    return Err(SimFail::AuthorityChanged);
                }
                if b.lamports > a.lamports {
                    let gain = b.lamports - a.lamports;
                    if !sol_gain_ok(&keys[i], b, user, gain, &mut tips, tip_cap) {
                        return Err(SimFail::SolLeft);
                    }
                }
                if let (Some((_, _, before_amt)), Some((mint, authority, after_amt))) = (token_pos(a), token_pos(b)) {
                    if after_amt > before_amt {
                        let gain = after_amt - before_amt;
                        if !token_gain_ok(authority, user) {
                            return Err(SimFail::TokenLeft);
                        }
                        if authority == *user && matches!(side, Side::Buy { output_mint, .. } if mint == output_mint) {
                            received_out = received_out.saturating_add(gain);
                        }
                    }
                }
            }
        }
    }
    match side {
        Side::Buy { min_out, max_sol_spent, .. } => {
            if received_out < min_out {
                return Err(SimFail::NotReceived);
            }
            let user_pre = user_lamports(keys, pre, user);
            let user_post = user_lamports(keys, post, user);
            if user_pre.saturating_sub(user_post) > max_sol_spent {
                return Err(SimFail::SolLeft);
            }
        }
        Side::Sell { min_out, fee_lamports, .. } => {
            let user_pre = user_lamports(keys, pre, user);
            let user_post = user_lamports(keys, post, user);
            if user_post.saturating_add(fee_lamports) < user_pre.saturating_add(min_out) {
                return Err(SimFail::NotReceived);
            }
        }
    }
    Ok(())
}

fn token_pos(acct: &Acct) -> Option<([u8; 32], [u8; 32], u64)> {
    if kind_of(acct) != Kind::Token {
        return None;
    }
    token_fields(&acct.data)
}

fn token_gain_ok(authority: [u8; 32], user: &[u8; 32]) -> bool {
    authority == *user || !is_on_curve(&authority)
}

fn fresh_ok(key: &[u8; 32], acct: &Acct, user: &[u8; 32]) -> bool {
    if key == user {
        return true;
    }
    if let Some((_, authority, _)) = token_pos(acct) {
        return token_gain_ok(authority, user);
    }
    // A new system account holding SOL for someone else is a transfer out.
    acct.lamports == 0 || !is_on_curve(key)
}

fn sol_gain_ok(key: &[u8; 32], acct: &Acct, user: &[u8; 32], gain: u64, tips: &mut u64, tip_cap: u64) -> bool {
    if key == user {
        return true;
    }
    if jito(key) {
        *tips = tips.saturating_add(gain);
        return *tips <= tip_cap;
    }
    if let Some((_, authority, _)) = token_pos(acct) {
        return token_gain_ok(authority, user);
    }
    // Off-curve program accounts may hold rent. An on-curve wallet may not receive SOL.
    !is_on_curve(key)
}

fn authority_bytes_changed(before: &Acct, after: &Acct) -> bool {
    match (kind_of(before), kind_of(after)) {
        (Kind::Token, Kind::Token) => {
            let n = before.data.len().min(after.data.len()).min(165);
            if n < 72 {
                return true;
            }
            before.data[..32] != after.data[..32]
                || before.data[32..64] != after.data[32..64]
                || before.data[72..n] != after.data[72..n]
        }
        (Kind::Mint, Kind::Mint) => {
            let n = before.data.len().min(after.data.len());
            if n < 82 {
                return true;
            }
            // Supply sits at bytes 36..44 and may not change either: a swap does not mint.
            before.data[..n] != after.data[..n]
        }
        (Kind::Other, Kind::Other) => false,
        _ => true,
    }
}

fn inner_authority_ok(keys: &[[u8; 32]], ixs: &[ResolvedIx]) -> Result<(), TxRefuse> {
    for ix in ixs {
        let prog = keys.get(ix.program).copied().ok_or(TxRefuse::Unresolved)?;
        if prog == tx::SYSTEM {
            let disc = ix.data.get(..4).map(|b| u32::from_le_bytes(b.try_into().unwrap_or([0; 4]))).unwrap_or(u32::MAX);
            // Assign, seed transfers, nonce withdraw/authorize, allocate. These change
            // ownership or move lamports outside a plain transfer the balance check sees.
            if matches!(disc, 1 | 3 | 5 | 7 | 8 | 9 | 10 | 11) {
                return Err(TxRefuse::TransferOut);
            }
        }
        if prog == TOKEN || prog == TOKEN_2022 {
            let disc = ix.data.first().copied().unwrap_or(255);
            if matches!(disc, 4 | 6 | 7 | 8 | 10 | 13 | 14 | 15 | 26) {
                return Err(TxRefuse::TransferOut);
            }
        }
    }
    Ok(())
}

fn user_lamports(keys: &[[u8; 32]], rows: &[Option<Acct>], user: &[u8; 32]) -> u64 {
    keys.iter()
        .zip(rows)
        .find(|(k, _)| *k == user)
        .and_then(|(_, row)| row.as_ref())
        .map(|a| a.lamports)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;

    fn user() -> [u8; 32] {
        SigningKey::from_bytes(&[7u8; 32]).verifying_key().to_bytes()
    }
    fn other() -> [u8; 32] {
        SigningKey::from_bytes(&[9u8; 32]).verifying_key().to_bytes()
    }
    fn pda() -> [u8; 32] {
        let mut k = [1u8; 32];
        while is_on_curve(&k) {
            k[0] = k[0].wrapping_add(1);
        }
        k
    }
    fn mint_data(mint_auth: bool, freeze: bool) -> Vec<u8> {
        let mut d = vec![0u8; 82];
        if mint_auth {
            d[0] = 1;
            d[4] = 3;
        }
        if freeze {
            d[46] = 1;
            d[50] = 4;
        }
        d
    }
    fn token_account(mint: [u8; 32], authority: [u8; 32], amount: u64) -> Acct {
        let mut data = vec![0u8; 165];
        data[..32].copy_from_slice(&mint);
        data[32..64].copy_from_slice(&authority);
        data[64..72].copy_from_slice(&amount.to_le_bytes());
        Acct { lamports: 2_039_280, owner: TOKEN, data }
    }

    #[test]
    fn a_revoked_mint_passes_and_a_live_authority_does_not() {
        let ok = parse_mint(&TOKEN, &mint_data(false, false)).unwrap();
        assert_eq!(guard_buy(&ok), Ok(()));
        let live = parse_mint(&TOKEN, &mint_data(true, false)).unwrap();
        assert_eq!(guard_buy(&live), Err(GuardFail::MintAuthority));
        let frozen = parse_mint(&TOKEN, &mint_data(false, true)).unwrap();
        assert_eq!(guard_buy(&frozen), Err(GuardFail::FreezeAuthority));
    }

    #[test]
    fn a_transfer_fee_at_the_guard_line_fails_the_buy() {
        let mut data = mint_data(false, false);
        data.push(1); // account type: mint
        let mut body = vec![0u8; 108];
        body[106] = 100;
        body[107] = 0;
        data.extend_from_slice(&1u16.to_le_bytes());
        data.extend_from_slice(&(body.len() as u16).to_le_bytes());
        data.extend_from_slice(&body);
        let view = parse_mint(&TOKEN_2022, &data).unwrap();
        assert_eq!(view.transfer_fee_bps, 100);
        assert_eq!(guard_buy(&view), Err(GuardFail::TransferFee));
    }

    #[test]
    fn the_user_may_receive_tokens_and_a_pool_may_receive_sol_a_wallet_may_not() {
        let user = user();
        let out = [5u8; 32];
        let mut user_sol = Acct { lamports: 1_000_000_000, owner: [0u8; 32], data: vec![] };
        let mut user_ata = token_account(out, user, 0);
        let mut pool = token_account([6u8; 32], pda(), 0);
        let keys = [user, [1u8; 32], [2u8; 32]];
        let pre = vec![
            Some(user_sol.clone()),
            Some(user_ata.clone()),
            Some(pool.clone()),
        ];
        user_sol.lamports -= 50_000_000;
        user_ata = token_account(out, user, 1_000);
        pool.lamports += 50_000_000;
        // pool is a token account; its lamports rose and its token amount did not.
        // sol_gain_ok allows a token account whose authority is off-curve.
        let post = vec![Some(user_sol), Some(user_ata), Some(pool)];
        let side = Side::Buy { output_mint: out, min_out: 1_000, max_sol_spent: 50_000_000 };
        assert_eq!(check_simulation(&keys, &pre, &post, &user, 0, side, &[]), Ok(()));

        let mut thief = token_account(out, other(), 0);
        let keys = [user, [3u8; 32]];
        let pre = vec![
            Some(Acct { lamports: 100, owner: [0u8; 32], data: vec![] }),
            Some(thief.clone()),
        ];
        thief = token_account(out, other(), 5);
        let post = vec![
            Some(Acct { lamports: 100, owner: [0u8; 32], data: vec![] }),
            Some(thief),
        ];
        let side = Side::Buy { output_mint: out, min_out: 1, max_sol_spent: 100 };
        assert_eq!(
            check_simulation(&keys, &pre, &post, &user, 0, side, &[]),
            Err(SimFail::TokenLeft)
        );
    }

    #[test]
    fn an_authority_byte_change_and_an_inner_transfer_out_are_refused() {
        let user = user();
        let out = [5u8; 32];
        let mut before = token_account(out, user, 10);
        let mut after = before.clone();
        after.data[32] ^= 1; // token-account owner changed
        let keys = [[8u8; 32]];
        assert_eq!(
            check_simulation(
                &keys,
                &[Some(before.clone())],
                &[Some(after)],
                &user,
                0,
                Side::Buy { output_mint: out, min_out: 0, max_sol_spent: 0 },
                &[]
            ),
            Err(SimFail::AuthorityChanged)
        );
        before.data[32] = user[0];
        let keys = [user, other(), tx::TOKEN];
        let ix = ResolvedIx { program: 2, accounts: vec![0, 1, 0], data: vec![6] };
        assert_eq!(
            check_simulation(
                &keys,
                &[None, None, None],
                &[None, None, None],
                &user,
                0,
                Side::Sell { input_mint: out, min_out: 0, fee_lamports: 0 },
                &[ix]
            ),
            Err(SimFail::Inner)
        );
    }
}
