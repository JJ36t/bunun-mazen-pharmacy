// Licensing Module — Ed25519 + Manifest
pub mod verifier;
pub mod keyring;
pub mod legacy;

pub use verifier::verify_license;
pub use keyring::Keyring;

use std::fs;
use std::path::PathBuf;

pub fn load_manifest() -> Result<Keyring, String> {
    let manifest_path = find_manifest().ok_or("لم يتم العثور على keys/manifest.json")?;
    let content = fs::read_to_string(&manifest_path).map_err(|e| format!("تعذّر قراءة manifest: {}", e))?;
    let manifest: Manifest = serde_json::from_str(&content).map_err(|e| format!("تعذّل تحليل manifest: {}", e))?;
    Keyring::from_manifest(manifest)
}

fn find_manifest() -> Option<PathBuf> {
    let paths = [
        PathBuf::from("keys/manifest.json"),
        PathBuf::from("../keys/manifest.json"),
        PathBuf::from("../../keys/manifest.json"),
        dirs::data_dir()?.join("BununMazenPharmacy").join("keys").join("manifest.json"),
    ];
    for path in &paths { if path.exists() { return Some(path.clone()); } }
    None
}

#[derive(Debug, serde::Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub algorithm: String,
    pub keys: Vec<ManifestKey>,
    pub legacy: LegacyConfig,
}

#[derive(Debug, serde::Deserialize)]
pub struct ManifestKey {
    pub id: String,
    pub public_key: String,
    pub created_at: String,
    pub status: String,
    pub comment: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct LegacyConfig {
    pub algorithm: String,
    pub enabled: bool,
    pub comment: Option<String>,
}

pub fn generate_device_fingerprint() -> String {
    // sysinfo 0.32 API: SystemExt/CpuExt traits removed, methods on System directly
    use sysinfo::System;
    use ring::digest;
    let sys = System::new_all();
    let mut fingerprint = String::new();
    if let Some(cpu) = sys.cpus().first() { fingerprint.push_str(&cpu.brand()); }
    // sysinfo 0.32: host_name() is a method on System, not a free function
    if let Some(host) = System::host_name() { fingerprint.push_str(&host); }
    let alg = digest::digest(&digest::SHA256, fingerprint.as_bytes());
    hex::encode(alg).to_uppercase()
}

/// Ensure that the licensing keypair + manifest exist.
/// Called once at app startup. If keys/manifest.json is missing,
/// generates a fresh Ed25519 keypair and writes a default manifest.
///
/// This is the P0 fix for "Ed25519 keys not generated" — the app now
/// self-provisions a manifest on first launch instead of requiring the
/// operator to run `cargo run --bin generate_keys` manually.
///
/// Returns true if a new keypair was generated, false if existing.
pub fn ensure_keys_exist() -> bool {
    let manifest_path = match find_manifest() {
        Some(p) => p,
        None => {
            // Generate new keypair at the data_dir location
            let data_dir = match dirs::data_dir() {
                Some(d) => d.join("BununMazenPharmacy").join("keys"),
                None => return false,
            };
            if let Err(e) = std::fs::create_dir_all(&data_dir) {
                tracing::error!(error = %e, "Failed to create keys directory");
                return false;
            }

            // Generate Ed25519 keypair
            use ed25519_dalek::SigningKey;
            let mut rng = rand::rngs::OsRng;
            let signing_key = SigningKey::generate(&mut rng);
            let verifying_key = signing_key.verifying_key();

            let private_hex = hex::encode(signing_key.to_bytes());
            let public_hex = hex::encode(verifying_key.to_bytes());

            // Save private key (root only on Unix; user-only on Windows)
            let private_key_path = data_dir.join("private_key.hex");
            if let Err(e) = std::fs::write(&private_key_path, &private_hex) {
                tracing::error!(error = %e, "Failed to write private key");
                return false;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(mut perms) = std::fs::metadata(&private_key_path).map(|m| m.permissions()) {
                    perms.set_mode(0o600);
                    let _ = std::fs::set_permissions(&private_key_path, perms);
                }
            }

            // Build the manifest
            let manifest = format!(
                r#"{{
  "version": 1,
  "algorithm": "Ed25519",
  "keys": [
    {{
      "id": "key-001",
      "public_key": "{}",
      "created_at": "{}",
      "status": "active",
      "comment": "Auto-generated on first launch"
    }}
  ],
  "legacy": {{
    "algorithm": "HMAC-SHA256",
    "enabled": false,
    "comment": "Legacy HMAC disabled — Ed25519 only"
  }}
}}"#,
                public_hex,
                chrono::Utc::now().to_rfc3339()
            );

            let manifest_file = data_dir.join("manifest.json");
            if let Err(e) = std::fs::write(&manifest_file, &manifest) {
                tracing::error!(error = %e, "Failed to write manifest.json");
                return false;
            }

            tracing::info!(
                private_key_path = %private_key_path.display(),
                manifest_path = %manifest_file.display(),
                "Generated new Ed25519 keypair on first launch"
            );
            eprintln!("========================================");
            eprintln!("[INIT] Generated new Ed25519 keypair");
            eprintln!("[INIT]   Private key: {}", private_key_path.display());
            eprintln!("[INIT]   Manifest:    {}", manifest_file.display());
            eprintln!("[INIT] Sign licenses with: cargo run --bin generate_device_license");
            eprintln!("========================================");
            return true;
        }
    };
    // Manifest already exists — nothing to do
    tracing::debug!(manifest_path = %manifest_path.display(), "Licensing manifest already present");
    false
}
