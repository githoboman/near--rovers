use crate::types::{BPS_DENOMINATOR, MAX_FEE_BPS, MIN_RESERVE, Outcome, PRICE_SCALE};

/// Minimal 256-bit unsigned integer (little-endian 64-bit limbs) for exact,
/// overflow-safe integer AMM arithmetic with zero floating point.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct U256(pub [u64; 4]);

impl Ord for U256 {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.cmp_val(other)
    }
}

impl PartialOrd for U256 {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl U256 {
    pub const ZERO: Self = Self([0, 0, 0, 0]);
    pub const ONE: Self = Self([1, 0, 0, 0]);

    pub fn from_u128(v: u128) -> Self {
        Self([v as u64, (v >> 64) as u64, 0, 0])
    }

    pub fn to_u128(self) -> Option<u128> {
        if self.0[2] != 0 || self.0[3] != 0 {
            return None;
        }
        Some((self.0[0] as u128) | ((self.0[1] as u128) << 64))
    }

    pub fn is_zero(self) -> bool {
        self == Self::ZERO
    }

    fn cmp_val(&self, other: &Self) -> core::cmp::Ordering {
        for i in (0..4).rev() {
            match self.0[i].cmp(&other.0[i]) {
                core::cmp::Ordering::Equal => continue,
                ord => return ord,
            }
        }
        core::cmp::Ordering::Equal
    }

    pub fn checked_add(self, rhs: Self) -> Option<Self> {
        let mut out = [0u64; 4];
        let mut carry = 0u128;
        for i in 0..4 {
            let sum = (self.0[i] as u128) + (rhs.0[i] as u128) + carry;
            out[i] = sum as u64;
            carry = sum >> 64;
        }
        if carry != 0 {
            return None;
        }
        Some(Self(out))
    }

    pub fn checked_sub(self, rhs: Self) -> Option<Self> {
        let mut out = [0u64; 4];
        let mut borrow = 0i128;
        for i in 0..4 {
            let diff = (self.0[i] as i128) - (rhs.0[i] as i128) - borrow;
            if diff < 0 {
                out[i] = (diff + (1i128 << 64)) as u64;
                borrow = 1;
            } else {
                out[i] = diff as u64;
                borrow = 0;
            }
        }
        if borrow != 0 {
            return None;
        }
        Some(Self(out))
    }

    pub fn checked_mul(self, rhs: Self) -> Option<Self> {
        let mut acc = [0u128; 8];
        for i in 0..4 {
            for j in 0..4 {
                let prod = (self.0[i] as u128) * (rhs.0[j] as u128);
                let idx = i + j;
                let lo = prod as u64 as u128;
                let hi = prod >> 64;
                acc[idx] += lo;
                acc[idx + 1] += hi;
            }
        }
        for k in 0..7 {
            let carry = acc[k] >> 64;
            acc[k] &= u64::MAX as u128;
            acc[k + 1] += carry;
        }
        if acc[4] != 0 || acc[5] != 0 || acc[6] != 0 || acc[7] != 0 {
            return None;
        }
        Some(Self([
            acc[0] as u64,
            acc[1] as u64,
            acc[2] as u64,
            acc[3] as u64,
        ]))
    }

    pub fn mul_u128(a: u128, b: u128) -> Self {
        let a0 = a as u64 as u128;
        let a1 = a >> 64;
        let b0 = b as u64 as u128;
        let b1 = b >> 64;

        let p00 = a0 * b0;
        let p01 = a0 * b1;
        let p10 = a1 * b0;
        let p11 = a1 * b1;

        let l0 = p00 as u64;
        let mid1 = (p00 >> 64) + (p01 as u64 as u128) + (p10 as u64 as u128);
        let l1 = mid1 as u64;
        let mid2 = (mid1 >> 64) + (p01 >> 64) + (p10 >> 64) + (p11 as u64 as u128);
        let l2 = mid2 as u64;
        let l3 = ((mid2 >> 64) + (p11 >> 64)) as u64;

        Self([l0, l1, l2, l3])
    }

    pub fn shl1(self) -> Option<Self> {
        if (self.0[3] >> 63) != 0 {
            return None;
        }
        Some(Self([
            self.0[0] << 1,
            (self.0[1] << 1) | (self.0[0] >> 63),
            (self.0[2] << 1) | (self.0[1] >> 63),
            (self.0[3] << 1) | (self.0[2] >> 63),
        ]))
    }

    fn shl1_with_bit(self, bit: u64) -> Self {
        Self([
            (self.0[0] << 1) | (bit & 1),
            (self.0[1] << 1) | (self.0[0] >> 63),
            (self.0[2] << 1) | (self.0[1] >> 63),
            (self.0[3] << 1) | (self.0[2] >> 63),
        ])
    }

    pub fn shr1(self) -> Self {
        Self([
            (self.0[0] >> 1) | (self.0[1] << 63),
            (self.0[1] >> 1) | (self.0[2] << 63),
            (self.0[2] >> 1) | (self.0[3] << 63),
            self.0[3] >> 1,
        ])
    }

    fn bit(&self, idx: usize) -> u64 {
        let limb = idx / 64;
        let offset = idx % 64;
        (self.0[limb] >> offset) & 1
    }

    fn set_bit(&mut self, idx: usize) {
        let limb = idx / 64;
        let offset = idx % 64;
        self.0[limb] |= 1u64 << offset;
    }

    /// Exact integer division (quotient, remainder) by a non-zero U256.
    pub fn div_rem(self, denom: Self) -> Option<(Self, Self)> {
        if denom.is_zero() {
            return None;
        }
        if self.cmp_val(&denom) == core::cmp::Ordering::Less {
            return Some((Self::ZERO, self));
        }
        let mut q = Self::ZERO;
        let mut r = Self::ZERO;
        for bit_idx in (0..256).rev() {
            r = r.shl1_with_bit(self.bit(bit_idx));
            if r.cmp_val(&denom) != core::cmp::Ordering::Less {
                r = r.checked_sub(denom).unwrap();
                q.set_bit(bit_idx);
            }
        }
        Some((q, r))
    }

    pub fn div_floor_u128(self, denom: u128) -> Option<u128> {
        let (q, _) = self.div_rem(Self::from_u128(denom))?;
        q.to_u128()
    }

    pub fn div_ceil_u128(self, denom: u128) -> Option<u128> {
        let (q, r) = self.div_rem(Self::from_u128(denom))?;
        let q128 = q.to_u128()?;
        if r.is_zero() {
            Some(q128)
        } else {
            q128.checked_add(1)
        }
    }

    /// Exact floor integer square root via bit-by-bit non-restoring shift.
    pub fn isqrt_floor(self) -> Self {
        let mut res = Self::ZERO;
        let mut rem = Self::ZERO;
        for step in (0..128).rev() {
            let hi_bit = self.bit(step * 2 + 1);
            let lo_bit = self.bit(step * 2);
            rem = rem.shl1_with_bit(hi_bit).shl1_with_bit(lo_bit);
            let trial = res.shl1_with_bit(0).shl1_with_bit(1); // 4*res + 1 (fits in 130 bits since res < 2^128)
            if rem.cmp_val(&trial) != core::cmp::Ordering::Less {
                rem = rem.checked_sub(trial).unwrap();
                res = res.shl1_with_bit(1);
            } else {
                res = res.shl1_with_bit(0);
            }
        }
        res
    }

    pub fn isqrt_ceil(self) -> Option<Self> {
        let floor = self.isqrt_floor();
        let sq = floor.checked_mul(floor)?;
        if sq == self {
            Some(floor)
        } else {
            floor.checked_add(Self::ONE)
        }
    }
}

pub fn mul_div_floor(a: u128, b: u128, denom: u128) -> Option<u128> {
    if denom == 0 {
        return None;
    }
    U256::mul_u128(a, b).div_floor_u128(denom)
}

pub fn mul_div_ceil(a: u128, b: u128, denom: u128) -> Option<u128> {
    if denom == 0 {
        return None;
    }
    U256::mul_u128(a, b).div_ceil_u128(denom)
}

/// Binary CPMM implied probabilities in 1e6 fixed-point scale.
/// `p_yes = no_reserve / (yes_reserve + no_reserve)`, `p_no = 1_000_000 - p_yes`.
pub fn price_e6(yes_reserve: u128, no_reserve: u128) -> Option<(u32, u32)> {
    let total = yes_reserve.checked_add(no_reserve)?;
    if total == 0 {
        return None;
    }
    let yes_p = mul_div_floor(no_reserve, PRICE_SCALE, total)? as u32;
    let no_p = (PRICE_SCALE as u32).checked_sub(yes_p)?;
    Some((yes_p, no_p))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BuyQuote {
    pub shares_out: u128,
    pub fee: u128,
    pub net_collateral: u128,
    pub new_yes_reserve: u128,
    pub new_no_reserve: u128,
    pub post_yes_price_e6: u32,
    pub post_no_price_e6: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SellQuote {
    pub gross_collateral: u128,
    pub net_collateral: u128,
    pub fee: u128,
    pub new_yes_reserve: u128,
    pub new_no_reserve: u128,
    pub post_yes_price_e6: u32,
    pub post_no_price_e6: u32,
}

/// Complete-set + constant-product buy:
/// User pays `collateral_in`. Fee goes to `fee_pool`. Remaining `net` mints
/// `net` YES + `net` NO complete sets; the unwanted side is swapped via x*y=k
/// (rounding reserve UP against the trader so invariant k never shrinks).
pub fn quote_buy(
    yes_reserve: u128,
    no_reserve: u128,
    collateral_in: u128,
    outcome: Outcome,
    fee_bps: u16,
) -> Option<BuyQuote> {
    if collateral_in == 0 || fee_bps > MAX_FEE_BPS {
        return None;
    }
    if yes_reserve < MIN_RESERVE || no_reserve < MIN_RESERVE {
        return None;
    }
    let fee = mul_div_ceil(collateral_in, fee_bps as u128, BPS_DENOMINATOR)?;
    let net_collateral = collateral_in.checked_sub(fee)?;
    if net_collateral == 0 {
        return None;
    }

    let k = U256::mul_u128(yes_reserve, no_reserve);
    let (new_yes_reserve, new_no_reserve, swap_out) = match outcome {
        Outcome::Yes => {
            let new_no = no_reserve.checked_add(net_collateral)?;
            let new_yes = k.div_ceil_u128(new_no)?;
            if new_yes < MIN_RESERVE {
                return None;
            }
            let swap_yes = yes_reserve.checked_sub(new_yes)?;
            (new_yes, new_no, swap_yes)
        }
        Outcome::No => {
            let new_yes = yes_reserve.checked_add(net_collateral)?;
            let new_no = k.div_ceil_u128(new_yes)?;
            if new_no < MIN_RESERVE {
                return None;
            }
            let swap_no = no_reserve.checked_sub(new_no)?;
            (new_yes, new_no, swap_no)
        }
    };

    if U256::mul_u128(new_yes_reserve, new_no_reserve) < k {
        return None;
    }

    let shares_out = net_collateral.checked_add(swap_out)?;
    let (post_yes_price_e6, post_no_price_e6) = price_e6(new_yes_reserve, new_no_reserve)?;

    Some(BuyQuote {
        shares_out,
        fee,
        net_collateral,
        new_yes_reserve,
        new_no_reserve,
        post_yes_price_e6,
        post_no_price_e6,
    })
}

/// Complete-set + constant-product sell:
/// User supplies `shares_in` of `outcome`. Pool provides `gross_collateral` of the
/// opposite share to burn complete sets from the vault and absorbs `(shares_in - gross_collateral)`
/// into the sold reserve, solving `(R_in + shares_in - C)*(R_out - C) >= k` rounded DOWN for C.
pub fn quote_sell(
    yes_reserve: u128,
    no_reserve: u128,
    shares_in: u128,
    outcome: Outcome,
    fee_bps: u16,
) -> Option<SellQuote> {
    if shares_in == 0 || fee_bps > MAX_FEE_BPS {
        return None;
    }
    if yes_reserve < MIN_RESERVE || no_reserve < MIN_RESERVE {
        return None;
    }

    let (r_in, r_out) = match outcome {
        Outcome::Yes => (yes_reserve, no_reserve),
        Outcome::No => (no_reserve, yes_reserve),
    };

    let b = U256::from_u128(r_in)
        .checked_add(U256::from_u128(r_out))?
        .checked_add(U256::from_u128(shares_in))?;
    let b_sq = b.checked_mul(b)?;
    let four_s_rout = U256::mul_u128(shares_in, r_out).checked_mul(U256::from_u128(4))?;
    let disc = b_sq.checked_sub(four_s_rout)?;
    let sqrt_disc = disc.isqrt_ceil()?;
    let gross_collateral = b.checked_sub(sqrt_disc)?.shr1().to_u128()?;
    if gross_collateral == 0 {
        return None;
    }

    let new_r_out = r_out.checked_sub(gross_collateral)?;
    let new_r_in = r_in.checked_add(shares_in)?.checked_sub(gross_collateral)?;
    if new_r_out < MIN_RESERVE || new_r_in < MIN_RESERVE {
        return None;
    }

    let k_before = U256::mul_u128(r_in, r_out);
    let k_after = U256::mul_u128(new_r_in, new_r_out);
    if k_after < k_before {
        return None;
    }

    let fee = mul_div_ceil(gross_collateral, fee_bps as u128, BPS_DENOMINATOR)?;
    let net_collateral = gross_collateral.checked_sub(fee)?;
    if net_collateral == 0 {
        return None;
    }

    let (new_yes_reserve, new_no_reserve) = match outcome {
        Outcome::Yes => (new_r_in, new_r_out),
        Outcome::No => (new_r_out, new_r_in),
    };
    let (post_yes_price_e6, post_no_price_e6) = price_e6(new_yes_reserve, new_no_reserve)?;

    Some(SellQuote {
        gross_collateral,
        net_collateral,
        fee,
        new_yes_reserve,
        new_no_reserve,
        post_yes_price_e6,
        post_no_price_e6,
    })
}
