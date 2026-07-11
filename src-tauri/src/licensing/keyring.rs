// Keyring — manage multiple public keys with rotation support
use super::Manifest;
use ed25519_dalek::{VerifyingKey, Signature, Verifier};
use hex;

pub struct Keyring {
    keys: Vec<PublicKeyEntry>,
    legacy_enabled: bool,
}

struct PublicKeyEntry {
    id: String,
    key: VerifyingKey,
    status: KeyStatus,
}

#[derive(PartialEq)]
enum KeyStatus { Active, Retired }

impl Keyring {
    pub fn from_manifest(manifest: Manifest) -> Result<Self, String> {
        let mut keys = Vec::new();
        for mk in &manifest.keys {
            let pubkey_bytes = hex::decode(&mk.public_key)
                .map_err(|e| format!("مفتاح عام غير صالح ({}): {}", mk.id, e))?;
            if pubkey_bytes.len() != 32 {
                return Err(format!("المفتاح العام {} يجب أن يكون 32 بايت (64 hex chars)، حصلنا على {} بايت", mk.id, pubkey_bytes.len()));
            }
            let key_array: [u8; 32] = pubkey_bytes.as_slice().try_into()
                .map_err(|_| format!("فشل تحويل المفتاح {}", mk.id))?;
            let verifying_key = VerifyingKey::from_bytes(&key_array)
                .map_err(|e| format!("مفتاح Ed25519 غير صالح ({}): {}", mk.id, e))?;
            let status = if mk.status == "active" { KeyStatus::Active } else { KeyStatus::Retired };
            keys.push(PublicKeyEntry { id: mk.id.clone(), key: verifying_key, status });
        }
        if keys.is_empty() {
            eprintln!("[Licensing] WARNING: No Ed25519 keys configured. Only legacy HMAC licenses will be accepted.");
        }
        Ok(Keyring { keys, legacy_enabled: manifest.legacy.enabled })
    }

    pub fn verify(&self, device_id: &str, signature_hex: &str) -> bool {
        let sig_bytes = match hex::decode(signature_hex) { Ok(b) if b.len() == 64 => b, _ => return false };
        let signature = match Signature::from_slice(&sig_bytes) { Ok(s) => s, Err(_) => return false };
        for entry in &self.keys {
            if entry.status == KeyStatus::Active {
                if entry.key.verify(device_id.as_bytes(), &signature).is_ok() { return true; }
            }
        }
        for entry in &self.keys {
            if entry.status == KeyStatus::Retired {
                if entry.key.verify(device_id.as_bytes(), &signature).is_ok() { return true; }
            }
        }
        false
    }

    pub fn legacy_enabled(&self) -> bool { self.legacy_enabled }
}
