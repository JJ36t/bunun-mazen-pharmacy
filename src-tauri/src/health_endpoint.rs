// Health endpoint — lightweight HTTP /health server on localhost
// Listens on 127.0.0.1:9191 (configurable via PHARMACY_HEALTH_PORT env var)
// Returns JSON: { status, version, db_ok, latency_ms, active_sessions, stale, uptime_s }
//
// Use case: external monitoring (Uptime Kuma, Consul, Kubernetes liveness probe)
// can poll this endpoint without authenticating to the Tauri app.

use sqlx::PgPool;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub async fn start_health_server(pool: PgPool) {
    let port: u16 = std::env::var("PHARMACY_HEALTH_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9191);
    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().expect("valid addr");

    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            tracing::info!(addr = %addr, "Health endpoint listening");
            l
        }
        Err(e) => {
            tracing::warn!(error = %e, addr = %addr, "Failed to bind health endpoint — skipping");
            return;
        }
    };

    let pool = Arc::new(pool);
    let start_time = Instant::now();

    loop {
        match listener.accept().await {
            Ok((mut stream, _peer)) => {
                let pool = pool.clone();
                let start = start_time;
                tokio::spawn(async move {
                    // Read request (we only care about the first line)
                    let mut buf = [0u8; 1024];
                    let _ = stream.read(&mut buf).await;
                    let req = String::from_utf8_lossy(&buf);
                    let first_line = req.lines().next().unwrap_or("");

                    let (status, body) = if first_line.contains("GET /health") {
                        let (db_ok, latency_ms, active_sessions, error) =
                            check_health(&pool).await;
                        let uptime_s = start.elapsed().as_secs();
                        let is_stale = false; // we just checked
                        let overall = if db_ok && !is_stale { "ok" } else { "degraded" };
                        let body = serde_json::json!({
                            "status": overall,
                            "version": APP_VERSION,
                            "db_ok": db_ok,
                            "db_latency_ms": latency_ms,
                            "active_sessions": active_sessions,
                            "uptime_s": uptime_s,
                            "error": error,
                        });
                        (200, body.to_string())
                    } else if first_line.contains("GET /ready") {
                        // /ready is a simpler check — just DB ping
                        let (db_ok, latency_ms, _, _) = check_health(&pool).await;
                        let body = serde_json::json!({
                            "ready": db_ok,
                            "db_latency_ms": latency_ms,
                        });
                        (200, body.to_string())
                    } else if first_line.contains("GET /") {
                        (200, r#"{"service":"bunun-mazen-pharmacy","endpoints":["/health","/ready"]}"#.to_string())
                    } else {
                        (404, r#"{"error":"not found"}"#.to_string())
                    };

                    let response = format!(
                        "HTTP/1.1 {} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        status,
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                });
            }
            Err(e) => {
                tracing::warn!(error = %e, "Health server accept failed");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

/// Probe the database — returns (ok, latency_ms, active_sessions, error_message)
async fn check_health(pool: &PgPool) -> (bool, Option<i32>, i64, Option<String>) {
    let start = Instant::now();
    match sqlx::query_scalar::<_, i64>("SELECT 1").fetch_one(pool).await {
        Ok(_) => {
            let latency_ms = start.elapsed().as_millis() as i32;
            // Active sessions count (best-effort)
            let active_sessions = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM user_sessions WHERE is_active = TRUE AND expires_at > NOW()"
            )
            .fetch_one(pool)
            .await
            .unwrap_or(0);

            // Record to app_health (best-effort)
            let _ = sqlx::query(
                "INSERT INTO app_health (app_version, db_ok, db_latency_ms, active_sessions) VALUES ($1, TRUE, $2, $3)"
            )
            .bind(APP_VERSION)
            .bind(latency_ms)
            .bind(active_sessions)
            .execute(pool)
            .await;

            (true, Some(latency_ms), active_sessions, None)
        }
        Err(e) => {
            let err_msg = e.to_string();
            let _ = sqlx::query(
                "INSERT INTO app_health (app_version, db_ok, active_sessions, error) VALUES ($1, FALSE, 0, $2)"
            )
            .bind(APP_VERSION)
            .bind(&err_msg)
            .execute(pool)
            .await;
            (false, None, 0, Some(err_msg))
        }
    }
}
