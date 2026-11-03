use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Small, dependency-free PRNG (xorshift64*) — good enough for mock data, NOT for crypto.
#[derive(Debug, Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn seeded() -> Self {
        let s = now_ms() ^ 0x9E37_79B9_7F4A_7C15;
        Self(if s == 0 { 1 } else { s })
    }
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    /// Uniform in [0, 1).
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.f64()
    }
    pub fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[(self.next_u64() % xs.len() as u64) as usize]
    }
    pub fn hex(&mut self, n: usize) -> String {
        (0..n)
            .map(|_| char::from_digit((self.next_u64() % 16) as u32, 16).unwrap())
            .collect()
    }
}

const B58: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub fn fake_mint(rng: &mut Rng) -> String {
    (0..44)
        .map(|_| B58[(rng.next_u64() % 58) as usize] as char)
        .collect()
}

/// Accept only base58 strings of plausible Solana pubkey length. Used before a mint
/// is ever placed in a window label or URL.
pub fn is_valid_mint(m: &str) -> bool {
    (32..=44).contains(&m.len()) && m.bytes().all(|b| B58.contains(&b))
}
