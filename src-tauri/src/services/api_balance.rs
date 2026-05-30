use crate::provider::{UsageData, UsageResult};
use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize)]
struct NewApiSubscriptionResponse {
    soft_limit_usd: Option<f64>,
    hard_limit_usd: Option<f64>,
    system_hard_limit_usd: Option<f64>,
}

#[derive(Deserialize)]
struct NewApiUsageResponse {
    total_usage: Option<f64>,
}

#[derive(Deserialize)]
struct Sub2ApiUsageResponse {
    mode: Option<String>,
    remaining: Option<f64>,
    balance: Option<f64>,
    unit: Option<String>,
    quota: Option<Sub2ApiQuota>,
    rate_limits: Option<Vec<Sub2ApiRateLimit>>,
}

#[derive(Deserialize)]
struct Sub2ApiQuota {
    limit: Option<f64>,
    used: Option<f64>,
    remaining: Option<f64>,
    unit: Option<String>,
}

#[derive(Deserialize)]
struct Sub2ApiRateLimit {
    window: Option<String>,
    limit: Option<f64>,
    remaining: Option<f64>,
    reset_at: Option<String>,
}

pub async fn get_api_usage_balance(
    template_type: &str,
    base_url: &str,
    api_key: &str,
    timeout_secs: u64,
) -> UsageResult {
    let base_url = base_url.trim();
    if base_url.is_empty() {
        return make_error("Base URL is required".to_string());
    }
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return make_error("API key is required".to_string());
    }

    match template_type {
        "sub2api" => query_sub2api_usage(base_url, api_key, timeout_secs).await,
        "newapi" => query_new_api_usage(base_url, api_key, timeout_secs).await,
        other => make_error(format!("Unsupported usage template: {other}")),
    }
}

async fn query_sub2api_usage(base_url: &str, api_key: &str, timeout_secs: u64) -> UsageResult {
    let url = sub2api_usage_url(base_url);
    let client = crate::proxy::http_client::get();
    let resp = match client
        .get(url)
        .bearer_auth(api_key)
        .header("Accept", "application/json")
        .timeout(request_timeout(timeout_secs))
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(error) => return make_error(format!("sub2api usage unavailable: {error}")),
    };

    let status = resp.status();
    if !status.is_success() {
        return make_error(format!("sub2api usage endpoint returned HTTP {status}"));
    }

    let body: Sub2ApiUsageResponse = match resp.json().await {
        Ok(body) => body,
        Err(error) => {
            return make_error(format!("Failed to parse sub2api usage response: {error}"))
        }
    };

    let mut data = Vec::new();
    if let Some(rate_limits) = body.rate_limits {
        for item in rate_limits {
            if let (Some(window), Some(limit), Some(remaining)) =
                (item.window, item.limit, item.remaining)
            {
                if limit > 0.0 {
                    let used = (limit - remaining).max(0.0);
                    data.push(UsageData {
                        plan_name: Some(window),
                        remaining: Some(remaining.max(0.0)),
                        total: Some(limit),
                        used: Some(used),
                        unit: Some("requests".to_string()),
                        is_valid: Some(true),
                        invalid_message: None,
                        extra: item.reset_at,
                    });
                }
            }
        }
    }

    if let Some(quota) = body.quota {
        data.insert(
            0,
            UsageData {
                plan_name: body.mode.or_else(|| Some("quota".to_string())),
                remaining: quota.remaining,
                total: quota.limit,
                used: quota.used,
                unit: quota.unit.or(body.unit),
                is_valid: Some(true),
                invalid_message: None,
                extra: None,
            },
        );
    } else if body.remaining.is_some() || body.balance.is_some() {
        data.insert(
            0,
            UsageData {
                plan_name: body.mode.or_else(|| Some("balance".to_string())),
                remaining: body.remaining.or(body.balance),
                total: None,
                used: None,
                unit: body.unit,
                is_valid: Some(true),
                invalid_message: None,
                extra: None,
            },
        );
    }

    if data.is_empty() {
        return make_error("sub2api response did not contain usable quota fields".to_string());
    }

    UsageResult {
        success: true,
        data: Some(data),
        error: None,
    }
}

async fn query_new_api_usage(base_url: &str, api_key: &str, timeout_secs: u64) -> UsageResult {
    let subscription_url = balance_url(base_url, "/dashboard/billing/subscription");
    let usage_url = balance_url(base_url, "/dashboard/billing/usage");
    let client = crate::proxy::http_client::get();

    let subscription_resp = match client
        .get(subscription_url)
        .bearer_auth(api_key)
        .header("Accept", "application/json")
        .timeout(request_timeout(timeout_secs))
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(error) => return make_error(format!("new-api balance unavailable: {error}")),
    };

    let status = subscription_resp.status();
    if !status.is_success() {
        return make_error(format!("new-api balance endpoint returned HTTP {status}"));
    }

    let subscription: NewApiSubscriptionResponse = match subscription_resp.json().await {
        Ok(body) => body,
        Err(error) => {
            return make_error(format!(
                "Failed to parse new-api subscription response: {error}"
            ))
        }
    };

    let used = match client
        .get(usage_url)
        .bearer_auth(api_key)
        .header("Accept", "application/json")
        .timeout(request_timeout(timeout_secs))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp
            .json::<NewApiUsageResponse>()
            .await
            .ok()
            .and_then(|body| body.total_usage)
            .map(|value| value / 100.0),
        _ => None,
    };

    let limit = subscription
        .system_hard_limit_usd
        .filter(|value| *value > 0.0)
        .or(subscription.hard_limit_usd.filter(|value| *value > 0.0))
        .or(subscription.soft_limit_usd.filter(|value| *value > 0.0));
    let remaining = match (limit, used) {
        (Some(limit), Some(used)) => Some((limit - used).max(0.0)),
        (Some(limit), None) => Some(limit),
        _ => None,
    };

    let Some(remaining) = remaining else {
        return make_error("new-api response did not contain a quota limit".to_string());
    };

    UsageResult {
        success: true,
        data: Some(vec![UsageData {
            plan_name: Some("new-api".to_string()),
            remaining: Some(remaining),
            total: limit,
            used,
            unit: Some("USD".to_string()),
            is_valid: Some(true),
            invalid_message: None,
            extra: None,
        }]),
        error: None,
    }
}

fn make_error(error: String) -> UsageResult {
    UsageResult {
        success: false,
        data: None,
        error: Some(error),
    }
}

fn request_timeout(timeout_secs: u64) -> Duration {
    Duration::from_secs(timeout_secs.clamp(2, 30))
}

fn balance_url(base_url: &str, path: &str) -> String {
    let root = provider_root_url(base_url);
    format!("{}{}", root, path)
}

fn sub2api_usage_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{}/usage", trimmed)
    } else {
        format!("{}/v1/usage", trimmed)
    }
}

fn provider_root_url(base_url: &str) -> &str {
    let trimmed = base_url.trim_end_matches('/');
    trimmed.strip_suffix("/v1").unwrap_or(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sub2api_usage_url_preserves_existing_v1() {
        assert_eq!(
            sub2api_usage_url("https://api.example.com/v1"),
            "https://api.example.com/v1/usage"
        );
        assert_eq!(
            sub2api_usage_url("https://api.example.com"),
            "https://api.example.com/v1/usage"
        );
    }

    #[test]
    fn new_api_balance_urls_strip_v1() {
        assert_eq!(
            balance_url(
                "https://api.example.com/v1",
                "/dashboard/billing/subscription"
            ),
            "https://api.example.com/dashboard/billing/subscription"
        );
    }
}
