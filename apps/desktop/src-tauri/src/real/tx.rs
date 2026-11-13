//! Refuse any transaction that can move value to an address other than the owner's wallet.
//! Swaps through the allowlisted programs stay. A tip is allowed only up to the owner's tip setting,
//! and only to the public Jito tip accounts. Nothing here signs or stores a key.

use super::b58;

pub const SYSTEM: [u8; 32] = [0u8; 32];
pub const TOKEN: [u8; 32] = [
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
];
pub const TOKEN_2022: [u8; 32] = [
    6, 221, 246, 225, 238, 117, 143, 222, 24, 66, 93, 188, 228, 108, 205, 218, 182, 26, 252, 77,
    131, 185, 13, 39, 254, 189, 249, 40, 216, 161, 139, 252,
];
pub const ATA: [u8; 32] = [
    140, 151, 37, 143, 78, 36, 137, 241, 187, 61, 16, 41, 20, 142, 13, 131, 11, 90, 19, 153, 218,
    255, 16, 132, 4, 142, 123, 216, 219, 233, 248, 89,
];
pub const COMPUTE: [u8; 32] = [
    3, 6, 70, 111, 229, 33, 23, 50, 255, 236, 173, 186, 114, 195, 155, 231, 188, 140, 229, 187,
    197, 247, 18, 107, 44, 67, 155, 58, 64, 0, 0, 0,
];
pub const JUPITER: [u8; 32] = [
    4, 121, 213, 91, 242, 49, 192, 110, 238, 116, 197, 110, 206, 104, 21, 7, 253, 177, 178, 222,
    163, 244, 142, 81, 2, 177, 205, 162, 86, 188, 19, 143,
];
pub const PUMPSWAP: [u8; 32] = [
    12, 20, 222, 252, 130, 94, 198, 118, 148, 37, 8, 24, 187, 101, 64, 101, 244, 41, 141, 49, 86,
    213, 113, 180, 212, 248, 9, 12, 24, 233, 168, 99,
];
pub const RAYDIUM: [u8; 32] = [
    75, 217, 73, 196, 54, 2, 195, 63, 32, 119, 144, 237, 22, 163, 82, 76, 161, 185, 151, 92, 241,
    33, 162, 169, 12, 255, 236, 125, 248, 182, 138, 205,
];
pub const RAYDIUM_CPMM: [u8; 32] = [
    169, 42, 90, 139, 79, 41, 89, 82, 132, 37, 80, 170, 147, 253, 91, 149, 181, 172, 230, 168, 235,
    146, 12, 147, 148, 46, 67, 105, 12, 32, 236, 115,
];
pub const METEORA: [u8; 32] = [
    9, 45, 33, 53, 101, 122, 21, 156, 43, 135, 212, 182, 106, 112, 219, 142, 151, 82, 56, 159, 247,
    106, 175, 32, 108, 237, 6, 58, 56, 249, 90, 237,
];

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

#[derive(Debug, PartialEq, Eq)]
pub enum TxRefuse {
    Truncated,
    UnknownProgram,
    TransferOut,
    TipOverCap,
    Unresolved,
}

struct Ix {
    program: usize,
    accounts: Vec<usize>,
    data: Vec<u8>,
}

fn shortvec(buf: &[u8], i: &mut usize) -> Result<usize, TxRefuse> {
    let mut n = 0usize;
    let mut shift = 0;
    loop {
        if *i >= buf.len() || shift > 28 {
            return Err(TxRefuse::Truncated);
        }
        let b = buf[*i];
        *i += 1;
        n |= usize::from(b & 0x7f) << shift;
        if b & 0x80 == 0 {
            return Ok(n);
        }
        shift += 7;
    }
}

fn key_at(keys: &[[u8; 32]], idx: usize) -> Result<&[u8; 32], TxRefuse> {
    keys.get(idx).ok_or(TxRefuse::Unresolved)
}

/// Append addresses from a lookup-table account (metadata is 56 bytes, then 32-byte keys).
pub fn lookup_addresses(data: &[u8]) -> Result<Vec<[u8; 32]>, TxRefuse> {
    if data.len() < 56 {
        return Err(TxRefuse::Unresolved);
    }
    let rest = &data[56..];
    if rest.len() % 32 != 0 {
        return Err(TxRefuse::Unresolved);
    }
    Ok(rest
        .chunks(32)
        .map(|c| {
            let mut a = [0u8; 32];
            a.copy_from_slice(c);
            a
        })
        .collect())
}

struct Msg {
    keys: Vec<[u8; 32]>,
    ixs: Vec<Ix>,
    /// (table account index, writable indexes, readonly indexes)
    lookups: Vec<(usize, Vec<usize>, Vec<usize>)>,
}

fn parse_message(buf: &[u8]) -> Result<Msg, TxRefuse> {
    let mut i = 0usize;
    let sigs = shortvec(buf, &mut i)?;
    i = i
        .checked_add(sigs.checked_mul(64).ok_or(TxRefuse::Truncated)?)
        .ok_or(TxRefuse::Truncated)?;
    if i >= buf.len() {
        return Err(TxRefuse::Truncated);
    }
    let versioned = buf[i] & 0x80 != 0;
    if versioned {
        if buf[i] != 0x80 {
            return Err(TxRefuse::Unresolved);
        }
        i += 1;
    }
    if i + 3 > buf.len() {
        return Err(TxRefuse::Truncated);
    }
    i += 3;
    let nkeys = shortvec(buf, &mut i)?;
    let mut keys = Vec::with_capacity(nkeys);
    for _ in 0..nkeys {
        if i + 32 > buf.len() {
            return Err(TxRefuse::Truncated);
        }
        let mut k = [0u8; 32];
        k.copy_from_slice(&buf[i..i + 32]);
        keys.push(k);
        i += 32;
    }
    i = i.checked_add(32).ok_or(TxRefuse::Truncated)?;
    if i > buf.len() {
        return Err(TxRefuse::Truncated);
    }
    let nix = shortvec(buf, &mut i)?;
    let mut ixs = Vec::with_capacity(nix);
    for _ in 0..nix {
        if i >= buf.len() {
            return Err(TxRefuse::Truncated);
        }
        let program = buf[i] as usize;
        i += 1;
        let na = shortvec(buf, &mut i)?;
        if i + na > buf.len() {
            return Err(TxRefuse::Truncated);
        }
        let accounts = buf[i..i + na].iter().map(|b| *b as usize).collect();
        i += na;
        let nd = shortvec(buf, &mut i)?;
        if i + nd > buf.len() {
            return Err(TxRefuse::Truncated);
        }
        let data = buf[i..i + nd].to_vec();
        i += nd;
        ixs.push(Ix {
            program,
            accounts,
            data,
        });
    }
    let mut lookups = Vec::new();
    if versioned {
        let nt = shortvec(buf, &mut i)?;
        for _ in 0..nt {
            if i >= buf.len() {
                return Err(TxRefuse::Truncated);
            }
            let table = buf[i] as usize;
            i += 1;
            let nw = shortvec(buf, &mut i)?;
            if i + nw > buf.len() {
                return Err(TxRefuse::Truncated);
            }
            let writable = buf[i..i + nw].iter().map(|b| *b as usize).collect();
            i += nw;
            let nr = shortvec(buf, &mut i)?;
            if i + nr > buf.len() {
                return Err(TxRefuse::Truncated);
            }
            let readonly = buf[i..i + nr].iter().map(|b| *b as usize).collect();
            i += nr;
            lookups.push((table, writable, readonly));
        }
    }
    Ok(Msg { keys, ixs, lookups })
}

fn allowed_program(id: &[u8; 32]) -> bool {
    matches!(
        *id,
        SYSTEM
            | TOKEN
            | TOKEN_2022
            | ATA
            | COMPUTE
            | JUPITER
            | PUMPSWAP
            | RAYDIUM
            | RAYDIUM_CPMM
            | METEORA
    ) || *id == memo()
}

fn memo() -> [u8; 32] {
    b58::decode_exact("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").unwrap_or([0; 32])
}

fn is_jito(id: &[u8; 32]) -> bool {
    JITO.iter()
        .any(|s| b58::decode_exact::<32>(s).ok().as_ref() == Some(id))
}

fn u32_le(data: &[u8]) -> Option<u32> {
    Some(u32::from_le_bytes(data.get(..4)?.try_into().ok()?))
}

fn u64_le(data: &[u8]) -> Option<u64> {
    Some(u64::from_le_bytes(data.get(..8)?.try_into().ok()?))
}

#[cfg(test)]
pub fn lookup_table_keys(tx: &[u8]) -> Result<Vec<[u8; 32]>, TxRefuse> {
    let msg = parse_message(tx)?;
    let mut out = Vec::new();
    for (idx, _, _) in &msg.lookups {
        out.push(*key_at(&msg.keys, *idx)?);
    }
    Ok(out)
}

pub fn fee_payer(tx: &[u8]) -> Result<[u8; 32], TxRefuse> {
    let msg = parse_message(tx)?;
    msg.keys.first().copied().ok_or(TxRefuse::Unresolved)
}

/// `tables` maps a lookup-table account pubkey to its account data. Missing data fails closed.
pub fn vet(
    tx: &[u8],
    owner: &[u8; 32],
    tip_cap: u64,
    tables: &[([u8; 32], &[u8])],
) -> Result<(), TxRefuse> {
    let msg = parse_message(tx)?;
    let mut keys = msg.keys.clone();
    for (table, writable, readonly) in &msg.lookups {
        let table_key = key_at(&msg.keys, *table)?;
        let data = tables
            .iter()
            .find(|(k, _)| k == table_key)
            .map(|(_, d)| *d)
            .ok_or(TxRefuse::Unresolved)?;
        let addrs = lookup_addresses(data)?;
        for idx in writable.iter().chain(readonly.iter()) {
            keys.push(*addrs.get(*idx).ok_or(TxRefuse::Unresolved)?);
        }
    }
    let mut closed_to_owner: Vec<[u8; 32]> = Vec::new();
    for ix in &msg.ixs {
        let prog = *key_at(&keys, ix.program)?;
        if (prog == TOKEN || prog == TOKEN_2022) && u32_le(&ix.data) == Some(9) {
            let dest = key_at(&keys, *ix.accounts.get(1).ok_or(TxRefuse::Truncated)?)?;
            if dest == owner {
                if let Some(acct) = ix.accounts.first() {
                    closed_to_owner.push(*key_at(&keys, *acct)?);
                }
            }
        }
    }
    for ix in &msg.ixs {
        let prog = *key_at(&keys, ix.program)?;
        if !allowed_program(&prog) {
            return Err(TxRefuse::UnknownProgram);
        }
        if prog == SYSTEM {
            let disc = u32_le(&ix.data).ok_or(TxRefuse::Truncated)?;
            if disc == 2 {
                let to = key_at(&keys, *ix.accounts.get(1).ok_or(TxRefuse::Truncated)?)?;
                let lamports = u64_le(ix.data.get(4..).ok_or(TxRefuse::Truncated)?)
                    .ok_or(TxRefuse::Truncated)?;
                if to == owner || closed_to_owner.iter().any(|c| c == to) {
                    continue;
                }
                if is_jito(to) {
                    if lamports > tip_cap {
                        return Err(TxRefuse::TipOverCap);
                    }
                    continue;
                }
                return Err(TxRefuse::TransferOut);
            }
        }
        if prog == TOKEN || prog == TOKEN_2022 {
            let disc = u32_le(&ix.data).unwrap_or(u32::MAX);
            if disc == 3 || disc == 12 {
                let dest_i = if disc == 3 { 1 } else { 2 };
                let dest = key_at(&keys, *ix.accounts.get(dest_i).ok_or(TxRefuse::Truncated)?)?;
                if dest != owner && !closed_to_owner.iter().any(|c| c == dest) {
                    return Err(TxRefuse::TransferOut);
                }
            }
            if disc == 9 {
                let dest = key_at(&keys, *ix.accounts.get(1).ok_or(TxRefuse::Truncated)?)?;
                if dest != owner {
                    return Err(TxRefuse::TransferOut);
                }
            }
        }
    }
    Ok(())
}

/// Legacy transaction: one signature slot, the given instructions. Tests build these; the app never signs them.
#[cfg(test)]
pub fn legacy_tx(keys: &[[u8; 32]], ixs: &[(usize, &[u8], &[u8])]) -> Vec<u8> {
    let mut msg = vec![1, 0, (keys.len() - 1) as u8, keys.len() as u8];
    for k in keys {
        msg.extend_from_slice(k);
    }
    msg.extend_from_slice(&[7u8; 32]);
    msg.push(ixs.len() as u8);
    for (prog, accounts, data) in ixs {
        msg.push(*prog as u8);
        msg.push(accounts.len() as u8);
        msg.extend_from_slice(accounts);
        msg.push(data.len() as u8);
        msg.extend_from_slice(data);
    }
    let mut out = vec![1u8];
    out.extend_from_slice(&[0u8; 64]);
    out.extend(msg);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn owner() -> [u8; 32] {
        let mut o = [0u8; 32];
        o[0] = 9;
        o
    }
    fn other() -> [u8; 32] {
        let mut o = [0u8; 32];
        o[0] = 4;
        o
    }
    fn transfer(to_is_second: bool, lamports: u64) -> Vec<u8> {
        let mut data = vec![2, 0, 0, 0];
        data.extend_from_slice(&lamports.to_le_bytes());
        let keys = [
            owner(),
            if to_is_second { other() } else { owner() },
            SYSTEM,
        ];
        legacy_tx(&keys, &[(2, &[0, if to_is_second { 1 } else { 0 }], &data)])
    }

    #[test]
    fn a_legacy_transaction_has_no_lookup_tables() {
        let tx = transfer(false, 1);
        assert!(lookup_table_keys(&tx).unwrap().is_empty());
    }

    #[test]
    fn sol_to_the_owner_is_allowed_and_to_anyone_else_is_not() {
        assert_eq!(vet(&transfer(false, 50), &owner(), 0, &[]), Ok(()));
        assert_eq!(
            vet(&transfer(true, 50), &owner(), 0, &[]),
            Err(TxRefuse::TransferOut)
        );
    }

    #[test]
    fn a_tip_above_the_setting_is_refused() {
        let tip = b58::decode_exact::<32>(JITO[0]).unwrap();
        let mut data = vec![2, 0, 0, 0];
        data.extend_from_slice(&1_000u64.to_le_bytes());
        let keys = [owner(), tip, SYSTEM];
        let tx = legacy_tx(&keys, &[(2, &[0, 1], &data)]);
        assert_eq!(vet(&tx, &owner(), 999, &[]), Err(TxRefuse::TipOverCap));
        assert_eq!(vet(&tx, &owner(), 1_000, &[]), Ok(()));
    }

    #[test]
    fn an_unknown_program_is_refused() {
        let mut prog = [3u8; 32];
        prog[0] = 8;
        let keys = [owner(), prog];
        let tx = legacy_tx(&keys, &[(1, &[0], &[1])]);
        assert_eq!(vet(&tx, &owner(), 0, &[]), Err(TxRefuse::UnknownProgram));
    }

    #[test]
    fn closing_an_account_to_someone_else_is_refused() {
        let mut acct = [5u8; 32];
        acct[0] = 5;
        let data = 9u32.to_le_bytes();
        let keys = [owner(), acct, other(), TOKEN];
        let tx = legacy_tx(&keys, &[(3, &[1, 2, 0], &data)]);
        assert_eq!(vet(&tx, &owner(), 0, &[]), Err(TxRefuse::TransferOut));
        let keys = [owner(), acct, TOKEN];
        let tx = legacy_tx(&keys, &[(2, &[1, 0, 0], &data)]);
        assert_eq!(vet(&tx, &owner(), 0, &[]), Ok(()));
    }
}
