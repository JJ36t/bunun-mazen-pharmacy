// Generate legacy HMAC license key for a device
// Usage: cargo run --bin generate_legacy_license -- --device-id <DEVICE_ID>
// 
// This is a temporary tool for dev/testing. Once Ed25519 keys are generated
// and added to manifest.json, use generate_license instead.

use ring::hmac;
use hex;
use clap::Parser;

#[derive(Parser)]
#[command(name = "generate_legacy_license")]
#[command(about = "Generate a legacy HMAC license key for a device (dev/testing)")]
struct Args {
    /// Device ID to generate license for
    #[arg(long)]
    device_id: String,
}

fn main() {
    let args = Args::parse();
    
    // Same secret as licensing/legacy.rs
    let secret = b"IRAQ_PHARMA_SECRET_2024_HMAC";
    let key = hmac::Key::new(hmac::HMAC_SHA256, secret);
    let tag = hmac::sign(&key, args.device_id.as_bytes());
    let hex_tag = hex::encode(tag).to_uppercase();
    
    // Format: first 12 hex chars as XXXX-XXXX-XXXX
    let license_key = format!("{}-{}-{}", &hex_tag[0..4], &hex_tag[4..8], &hex_tag[8..12]);
    
    println!("========================================");
    println!("Legacy HMAC License Key");
    println!("========================================");
    println!("Device ID: {}", args.device_id);
    println!("License key: {}", license_key);
    println!("========================================");
    println!("Enter this key in the license activation screen.");
}
