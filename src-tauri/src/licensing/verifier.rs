// Verifier — Ed25519 + legacy HMAC fallback
use super::keyring::Keyring;
use super::legacy;

pub fn verify_license(keyring: &Keyring, device_id: &str, activation_key: &str) -> bool {
    let key_clean = activation_key.trim().to_uppercase();
    if keyring.verify(device_id, &key_clean) { return true; }
    if keyring.legacy_enabled() { return legacy::verify_hmac_license(device_id, &key_clean); }
    false
}
