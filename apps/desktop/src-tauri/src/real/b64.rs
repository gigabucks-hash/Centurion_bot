//! Base64 (standard) for Solana transaction bytes. No padding is accepted too.

pub fn decode(s: &str) -> Result<Vec<u8>, ()> {
    fn val(c: u8) -> Result<u8, ()> {
        Ok(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err(()),
        })
    }
    let bytes: Vec<u8> = s
        .bytes()
        .filter(|c| !c.is_ascii_whitespace() && *c != b'=')
        .collect();
    if bytes.len() % 4 == 1 {
        return Err(());
    }
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let remain = bytes.len() - i;
        let n = remain.min(4);
        let mut buf = [0u8; 4];
        for j in 0..n {
            buf[j] = val(bytes[i + j])?;
        }
        if n >= 2 {
            out.push((buf[0] << 2) | (buf[1] >> 4));
        }
        if n >= 3 {
            out.push((buf[1] << 4) | (buf[2] >> 2));
        }
        if n == 4 {
            out.push((buf[2] << 6) | buf[3]);
        }
        i += n;
    }
    Ok(out)
}
