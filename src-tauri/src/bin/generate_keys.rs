// Generate Ed25519 keypair for license signing
use ed25519_dalek::{SigningKey};
use hex;

fn main() {
    let mut rng = rand::rngs::OsRng;
    let signing_key = SigningKey::generate(&mut rng);
    let verifying_key = signing_key.verifying_key();

    let private_hex = hex::encode(signing_key.to_bytes());
    let public_hex = hex::encode(verifying_key.to_bytes());

    println!("========================================");
    println!("Ed25519 Keypair Generated");
    println!("========================================");
    println!("Private key (KEEP SECRET — never commit):");
    println!("  {}", private_hex);
    println!();
    println!("Public key (add to keys/manifest.json):");
    println!("  {}", public_hex);
    println!("========================================");

    // Save private key to file
    let key_path = "private_key.hex";
    std::fs::write(key_path, &private_hex).expect("Failed to write private key");
    println!("Private key saved to: {}", key_path);
    println!();
    println!("Add this to keys/manifest.json:");
    println!(r#"  {{
    "id": "key-001",
    "public_key": "{}",
    "created_at": "{}",
    "status": "active",
    "comment": "Primary Ed25519 key"
  }}"#, public_hex, chrono::Utc::now().to_rfc3339());
}
