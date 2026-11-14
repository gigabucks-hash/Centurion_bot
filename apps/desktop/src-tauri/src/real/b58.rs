//! Base58 (Bitcoin alphabet) for wallet pubkeys and signatures. No private keys.

const ALPH: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub fn decode(s: &str) -> Result<Vec<u8>, ()> {
    if s.is_empty() {
        return Ok(Vec::new());
    }
    let mut acc: Vec<u8> = Vec::new();
    for c in s.bytes() {
        let mut carry = ALPH.iter().position(|a| *a == c).ok_or(())? as u32;
        for b in acc.iter_mut() {
            let cur = u32::from(*b) * 58 + carry;
            *b = (cur & 0xff) as u8;
            carry = cur >> 8;
        }
        while carry > 0 {
            acc.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    acc.reverse();
    let zeros = s.bytes().take_while(|c| *c == b'1').count();
    let mut out = vec![0u8; zeros];
    out.extend(acc.into_iter().skip_while(|b| *b == 0));
    Ok(out)
}

pub fn encode(bytes: &[u8]) -> String {
    let zeros = bytes.iter().take_while(|b| **b == 0).count();
    let mut digits: Vec<u8> = Vec::new();
    for &b in bytes {
        let mut carry = u32::from(b);
        for d in &mut digits {
            let cur = (u32::from(*d) << 8) + carry;
            *d = (cur % 58) as u8;
            carry = cur / 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut s = "1".repeat(zeros);
    for d in digits.iter().rev() {
        s.push(ALPH[*d as usize] as char);
    }
    s
}

pub fn decode_exact<const N: usize>(s: &str) -> Result<[u8; N], ()> {
    let v = decode(s)?;
    if v.len() != N {
        return Err(());
    }
    let mut a = [0u8; N];
    a.copy_from_slice(&v);
    Ok(a)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_system_program() {
        let zeros = [0u8; 32];
        assert_eq!(encode(&zeros), "11111111111111111111111111111111");
        assert_eq!(decode_exact::<32>(&encode(&zeros)).unwrap(), zeros);
        let mut sample = [0u8; 32];
        sample[0] = 9;
        sample[31] = 1;
        assert_eq!(decode(&encode(&sample)).unwrap(), sample);
        assert_eq!(
            encode(&decode("So11111111111111111111111111111111111111112").unwrap()),
            "So11111111111111111111111111111111111111112"
        );
    }
}
