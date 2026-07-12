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
        dirs_next::data_dir()?.join("BununMazenPharmacy").join("keys").join("manifest.json"),
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
    use sysinfo::{System, SystemExt, CpuExt};
    use ring::digest;
    let mut sys = System::new_all();
    sys.refresh_all();
    let mut fingerprint = String::new();
    if let Some(cpu) = sys.cpus().first() { fingerprint.push_str(&cpu.brand()); }
    if let Some(host) = sys.host_name() { fingerprint.push_str(&host); }
    let alg = digest::digest(&digest::SHA256, fingerprint.as_bytes());
    hex::encode(alg).to_uppercase()
}
