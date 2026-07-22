// Reset admin password to a known value
// Usage: cargo run --bin reset_admin_password
//
// This tool connects to the database and resets the admin password to "admin123"
// with bcrypt cost 12 (matching the app's BCRYPT_COST constant).
// Use this when you've lost the randomly generated password.
//
// After logging in with admin123, change it immediately from Settings.

use sqlx::postgres::PgPoolOptions;
use bcrypt;

const BCRYPT_COST: u32 = 12;

#[tokio::main]
async fn main() {
    // Read DB connection from environment (same as main.rs)
    let db_password = std::env::var("PHARMACY_DB_PASSWORD").unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            "123456".to_string()
        } else {
            eprintln!("[ERROR] PHARMACY_DB_PASSWORD not set");
            std::process::exit(1);
        }
    });
    let db_user = std::env::var("PHARMACY_DB_USER").unwrap_or_else(|_| "postgres".to_string());
    let db_host = std::env::var("PHARMACY_DB_HOST").unwrap_or_else(|_| "localhost".to_string());
    let db_port = std::env::var("PHARMACY_DB_PORT").unwrap_or_else(|_| "5432".to_string());
    let database_url = format!("postgres://{}:{}@{}:{}/pharmacy_db", db_user, db_password, db_host, db_port);

    println!("Connecting to database...");
    let pool = PgPoolOptions::new().max_connections(1).connect(&database_url)
        .await
        .expect("Failed to connect to database");

    // Check if admin user exists
    let admin_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = 'admin'")
        .fetch_one(&pool).await.unwrap_or(0);

    if admin_count == 0 {
        println!("Admin user not found. Creating new admin user...");
        let hashed = bcrypt::hash("admin123", BCRYPT_COST).expect("Failed to hash password");
        sqlx::query("INSERT INTO users (username, password, role, is_active, must_change_password) VALUES ('admin', $1, 'Super Admin', TRUE, TRUE)")
            .bind(hashed)
            .execute(&pool).await
            .expect("Failed to create admin user");
        println!("========================================");
        println!("Admin user created!");
        println!("  Username: admin");
        println!("  Password: admin123");
        println!("========================================");
        println!("IMPORTANT: Change this password immediately after login!");
    } else {
        println!("Admin user found. Resetting password...");
        let hashed = bcrypt::hash("admin123", BCRYPT_COST).expect("Failed to hash password");
        sqlx::query("UPDATE users SET password = $1, is_active = TRUE, deleted_at = NULL, must_change_password = TRUE WHERE username = 'admin'")
            .bind(hashed)
            .execute(&pool).await
            .expect("Failed to update admin password");
        println!("========================================");
        println!("Admin password reset!");
        println!("  Username: admin");
        println!("  Password: admin123");
        println!("========================================");
        println!("IMPORTANT: Change this password immediately after login!");
    }

    // Also ensure cashier exists
    let cashier_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = 'cashier'")
        .fetch_one(&pool).await.unwrap_or(0);

    if cashier_count == 0 {
        println!("\nCashier user not found. Creating new cashier user...");
        let hashed = bcrypt::hash("cashier123", BCRYPT_COST).expect("Failed to hash password");
        sqlx::query("INSERT INTO users (username, password, role, is_active, must_change_password) VALUES ('cashier', $1, 'Cashier', TRUE, TRUE)")
            .bind(hashed)
            .execute(&pool).await
            .expect("Failed to create cashier user");
        println!("========================================");
        println!("Cashier user created!");
        println!("  Username: cashier");
        println!("  Password: cashier123");
        println!("========================================");
    } else {
        println!("\nCashier user found. Resetting password...");
        let hashed = bcrypt::hash("cashier123", BCRYPT_COST).expect("Failed to hash password");
        sqlx::query("UPDATE users SET password = $1, is_active = TRUE, deleted_at = NULL, must_change_password = TRUE WHERE username = 'cashier'")
            .bind(hashed)
            .execute(&pool).await
            .expect("Failed to update cashier password");
        println!("========================================");
        println!("Cashier password reset!");
        println!("  Username: cashier");
        println!("  Password: cashier123");
        println!("========================================");
    }

    println!("\nDone! You can now log in with these credentials.");
    println!("Remember to change passwords immediately after login.");
}
