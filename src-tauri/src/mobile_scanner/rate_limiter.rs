// Rate Limiter — منع المسح المتكرر السريع
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    last_scans: Arc<RwLock<HashMap<String, Instant>>>,
    min_interval: Duration,
}

impl RateLimiter {
    pub fn new(min_interval_ms: u64) -> Self {
        Self {
            last_scans: Arc::new(RwLock::new(HashMap::new())),
            min_interval: Duration::from_millis(min_interval_ms),
        }
    }

    pub async fn check(&self, key: &str) -> bool {
        let mut scans = self.last_scans.write().await;
        let now = Instant::now();

        if let Some(last) = scans.get(key) {
            if now.duration_since(*last) < self.min_interval {
                return false; // مرفوض — سريع جداً
            }
        }

        scans.insert(key.to_string(), now);
        true // مسموح
    }
}
