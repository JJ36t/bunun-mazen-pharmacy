// Generate Ed25519 license key for a device
use clap::Parser;
use ed25519_dalek::{SigningKey, Signer};
use hex;

#[derive(Parser)]
#[command(name = "generate_license")]
#[command(about = "Generate an Ed25519 license key for a device")]
struct Args {
    /// Device ID to generate license for
    #[arg(long)]
    device_id: String,
}

fn main() {
    let args = Args::parse();

    // Load or generate signing key
    let key_path = std::env::var("LICENSE_PRIVATE_KEY_PATH")
        .unwrap_or_else(|_| "private_key.hex".to_string());

    let signing_key = if std::path::Path::new(&key_path).exists() {
        let key_hex = std::fs::read_to_string(&key_path).expect("Failed to read private key");
        let key_bytes = hex::decode(key_hex.trim()).expect("Invalid hex key");
        let key_array: [u8; 32] = key_bytes.as_slice().try_into().expect("Key must be 32 bytes");
        SigningKey::from_bytes(&key_array)
    } else {
        let mut rng = rand::rngs::OsRng;
        let key = SigningKey::generate(&mut rng);
        std::fs::write(&key_path, hex::encode(key.to_bytes())).expect("Failed to write private key");
        eprintln!("Generated new private key at: {}", key_path);
        eprintln!("Public key: {}", hex::encode(key.verifying_key().to_bytes()));
        key
    };

    // Sign the device_id
    let signature = signing_key.sign(args.device_id.as_bytes());
    let sig_hex = hex::encode(signature.to_bytes()).to_uppercase();

    println!("License key for device {}: {}", args.device_id, sig_hex);
    println!("Add this public key to keys/manifest.json:");
    println!("  {}", hex::encode(signing_key.verifying_key().to_bytes()));
}
