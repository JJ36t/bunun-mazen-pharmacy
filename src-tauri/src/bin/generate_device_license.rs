// Generate device ID + legacy HMAC license key in one step
// Usage: cargo run --bin generate_device_license
//
// This tool computes the device fingerprint (same as the app) and generates
// a legacy HMAC license key for it. Run this on the target machine.

use sysinfo::{System, SystemExt, CpuExt};
use ring::{digest, hmac};
use hex;

fn main() {
    // Compute device fingerprint (same logic as licensing/mod.rs)
    let mut sys = System::new_all();
    sys.refresh_all();
    let mut fingerprint = String::new();
    if let Some(cpu) = sys.cpus().first() { fingerprint.push_str(&cpu.brand()); }
    if let Some(host) = sys.host_name() { fingerprint.push_str(&host); }
    let alg = digest::digest(&digest::SHA256, fingerprint.as_bytes());
    let device_id = hex::encode(alg).to_uppercase();

    println!("========================================");
    println!("Device Information");
    println!("========================================");
    println!("CPU brand: {}", sys.cpus().first().map(|c| c.brand()).unwrap_or("Unknown"));
    println!("Hostname:  {}", sys.host_name().unwrap_or_default());
    println!("Device ID: {}", device_id);
    println!("========================================");

    // Generate legacy HMAC license key
    let secret = b"IRAQ_PHARMA_SECRET_2024_HMAC";
    let key = hmac::Key::new(hmac::HMAC_SHA256, secret);
    let tag = hmac::sign(&key, device_id.as_bytes());
    let hex_tag = hex::encode(tag).to_uppercase();
    let license_key = format!("{}-{}-{}", &hex_tag[0..4], &hex_tag[4..8], &hex_tag[8..12]);

    println!("License Key: {}", license_key);
    println!("========================================");
    println!("Enter this key in the license activation screen.");
    println!("========================================");
}
