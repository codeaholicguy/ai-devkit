//! File-based codex auth probe — the daemon-side equivalent of
//! `resolveCodexCredentials` used by the TS `codexAuth` injectable.
//! Returns `Some(true)` when a usable credential exists, `Some(false)`
//! when auth.json parses but yields none, `None` when the file is
//! missing or malformed (TS `codexAuth` → `boolean | null`).

use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::shared::parse_iso_ms;

pub fn resolve_auth_path(home_dir: &str) -> PathBuf {
    match std::env::var("CODEX_HOME").ok().filter(|v| !v.is_empty()) {
        Some(root) => Path::new(&root).join("auth.json"),
        None => Path::new(home_dir).join(".codex").join("auth.json"),
    }
}

fn record(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    value.as_object()
}

fn non_empty_text(value: Option<&Value>) -> Option<&str> {
    value.and_then(|v| v.as_str()).filter(|s| !s.is_empty())
}

fn finite_number(value: Option<&Value>) -> Option<f64> {
    value.and_then(|v| v.as_f64()).filter(|n| n.is_finite())
}

fn jwt_expiry(token: &str) -> Option<f64> {
    let part = token.split('.').nth(1)?;
    let mut s = part.replace('-', "+").replace('_', "/");
    while s.len() % 4 != 0 {
        s.push('=');
    }
    let decoded = decode_base64(&s)?;
    let parsed: Value = serde_json::from_slice(&decoded).ok()?;
    finite_number(record(&parsed)?.get("exp"))
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    const TABLE: [i8; 128] = {
        let mut t = [-1i8; 128];
        let mut i = 0;
        while i < 26 {
            t[b'A' as usize + i] = i as i8;
            t[b'a' as usize + i] = (i + 26) as i8;
            i += 1;
        }
        let mut i = 0;
        while i < 10 {
            t[b'0' as usize + i] = (i + 52) as i8;
            i += 1;
        }
        t[b'+' as usize] = 62;
        t[b'/' as usize] = 63;
        t
    };
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut nbits = 0;
    for &b in input.as_bytes() {
        if b == b'=' {
            break;
        }
        if b as usize >= 128 || TABLE[b as usize] < 0 {
            return None;
        }
        acc = (acc << 6) | TABLE[b as usize] as u32;
        nbits += 6;
        if nbits >= 8 {
            nbits -= 8;
            out.push((acc >> nbits) as u8);
        }
    }
    Some(out)
}

fn stale_oauth(tokens: &serde_json::Map<String, Value>, token: &str, now_s: f64) -> bool {
    let metadata = tokens
        .get("expires_at")
        .or_else(|| tokens.get("expiresAt"))
        .or_else(|| tokens.get("expiry"));
    let mut expiry = finite_number(metadata);
    if let Some(s) = metadata.and_then(|m| m.as_str()) {
        expiry = parse_iso_ms(s).map(|ms| ms as f64 / 1000.0);
    }
    expiry = expiry.or_else(|| jwt_expiry(token));
    expiry.is_some_and(|e| e <= now_s)
}

/// `Some(true)` creds valid · `Some(false)` parsed but unusable · `None` no file.
pub fn codex_auth_state(home_dir: &str) -> Option<bool> {
    let text = std::fs::read_to_string(resolve_auth_path(home_dir)).ok()?;
    let parsed: Value = serde_json::from_str(&text).ok()?;
    let auth = record(&parsed).cloned().unwrap_or_default();
    if non_empty_text(auth.get("personal_access_token")).is_some() {
        return Some(true);
    }
    if let Some(tokens) = record(&auth["tokens"]) {
        let access = non_empty_text(tokens.get("access_token"));
        let account = non_empty_text(tokens.get("account_id"));
        if let (Some(access), Some(_account_id)) = (access, account) {
            let now_s = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as f64 / 1000.0)
                .unwrap_or(0.0);
            if !stale_oauth(tokens, access, now_s) {
                return Some(true);
            }
        }
    }
    Some(false)
}
