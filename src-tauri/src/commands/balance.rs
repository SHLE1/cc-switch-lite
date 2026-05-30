use crate::provider::UsageResult;

#[tauri::command]
pub async fn get_balance(base_url: String, api_key: String) -> Result<UsageResult, String> {
    crate::services::balance::get_balance(&base_url, &api_key).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_api_usage_balance(
    template_type: String,
    base_url: String,
    api_key: String,
    timeout_secs: Option<u64>,
) -> Result<UsageResult, String> {
    Ok(crate::services::api_balance::get_api_usage_balance(
        &template_type,
        &base_url,
        &api_key,
        timeout_secs.unwrap_or(10),
    )
    .await)
}
