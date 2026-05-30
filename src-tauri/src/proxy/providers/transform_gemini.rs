//! Gemini Native format conversion module.
//!
//! Converts Anthropic Messages requests to Gemini `generateContent` requests,
//! and Gemini `GenerateContentResponse` payloads back to Anthropic Messages
//! responses for Claude-compatible clients.

use super::gemini_schema::build_gemini_function_declaration;
use super::gemini_shadow::{GeminiAssistantTurn, GeminiShadowStore, GeminiToolCallMeta};
use crate::proxy::error::ProxyError;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AnthropicToolSchemaHint {
    expected_keys: Vec<String>,
    required_keys: Vec<String>,
}

pub type AnthropicToolSchemaHints = HashMap<String, AnthropicToolSchemaHint>;

/// Prefix used for Anthropic-visible tool call ids that we synthesize when
/// Gemini's `functionCall` omits the `id` field (Gemini 2.x parallel calls
/// often do). The prefix is how downstream request-path code recognizes that
/// the id is not a real Gemini id and must be stripped before forwarding back
/// to Gemini as `functionResponse.id`.
pub(crate) const SYNTHESIZED_ID_PREFIX: &str = "gemini_synth_";

/// Generate a unique tool-call id that is safe to expose to Anthropic clients
/// but must not be sent upstream to Gemini. Uses UUID v4 simple encoding
/// (32 lowercase hex chars) so that any number of parallel calls in the same
/// response remain distinguishable.
pub(crate) fn synthesize_tool_call_id() -> String {
    format!("{SYNTHESIZED_ID_PREFIX}{}", uuid::Uuid::new_v4().simple())
}

/// Returns true if `id` was produced by [`synthesize_tool_call_id`] and
/// therefore must be stripped when building Gemini request bodies.
pub(crate) fn is_synthesized_tool_call_id(id: &str) -> bool {
    id.starts_with(SYNTHESIZED_ID_PREFIX)
}


pub fn anthropic_to_gemini_with_shadow(
    body: Value,
    shadow_store: Option<&GeminiShadowStore>,
    provider_id: Option<&str>,
    session_id: Option<&str>,
) -> Result<Value, ProxyError> {
    let mut result = json!({});
    let shadow_turns = shadow_store
        .zip(provider_id)
        .zip(session_id)
        .and_then(|((store, provider_id), session_id)| store.get_session(provider_id, session_id))
        .map(|snapshot| snapshot.turns)
        .unwrap_or_default();

    if let Some(system) = build_system_instruction(body.get("system"))? {
        result["systemInstruction"] = system;
    }

    if let Some(messages) = body.get("messages").and_then(|value| value.as_array()) {
        result["contents"] = json!(convert_messages_to_contents(messages, &shadow_turns)?);
    }

    if let Some(generation_config) = build_generation_config(&body) {
        result["generationConfig"] = generation_config;
    }

    if let Some(tools) = body.get("tools").and_then(|value| value.as_array()) {
        let function_declarations: Vec<Value> = tools
            .iter()
            .filter(|tool| tool.get("type").and_then(|value| value.as_str()) != Some("BatchTool"))
            .map(|tool| {
                build_gemini_function_declaration(
                    tool.get("name")
                        .and_then(|value| value.as_str())
                        .unwrap_or(""),
                    tool.get("description").and_then(|value| value.as_str()),
                    tool.get("input_schema")
                        .cloned()
                        .unwrap_or_else(|| json!({})),
                )
            })
            .collect();

        if !function_declarations.is_empty() {
            result["tools"] = json!([{ "functionDeclarations": function_declarations }]);
        }
    }

    if let Some(tool_config) = map_tool_choice(body.get("tool_choice"))? {
        result["toolConfig"] = tool_config;
    }

    Ok(result)
}

/// Convenience wrapper over [`gemini_to_anthropic_with_shadow_and_hints`]
/// with no shadow store or schema hints. Used by the shared
/// `ProviderAdapter::transform_response` path and by tests.
#[allow(dead_code)] // kept as public API for non-streaming transform paths
pub fn gemini_to_anthropic(body: Value) -> Result<Value, ProxyError> {
    gemini_to_anthropic_with_shadow(body, None, None, None)
}

/// Convenience wrapper for callers that have a shadow store but no tool
/// schema hints. Production call sites funnel through
/// [`gemini_to_anthropic_with_shadow_and_hints`] directly; this helper exists
/// for test ergonomics and future external callers.
#[allow(dead_code)] // kept as public API for shadow-only transform paths
pub fn gemini_to_anthropic_with_shadow(
    body: Value,
    shadow_store: Option<&GeminiShadowStore>,
    provider_id: Option<&str>,
    session_id: Option<&str>,
) -> Result<Value, ProxyError> {
    gemini_to_anthropic_with_shadow_and_hints(body, shadow_store, provider_id, session_id, None)
}

pub fn gemini_to_anthropic_with_shadow_and_hints(
    body: Value,
    shadow_store: Option<&GeminiShadowStore>,
    provider_id: Option<&str>,
    session_id: Option<&str>,
    tool_schema_hints: Option<&AnthropicToolSchemaHints>,
) -> Result<Value, ProxyError> {
    if let Some(block_reason) = body
        .get("promptFeedback")
        .and_then(|value| value.get("blockReason"))
        .and_then(|value| value.as_str())
    {
        let text = format!("Request blocked by Gemini safety filters: {block_reason}");
        return Ok(json!({
            "id": body.get("responseId").and_then(|value| value.as_str()).unwrap_or(""),
            "type": "message",
            "role": "assistant",
            "content": [{ "type": "text", "text": text }],
            "model": body.get("modelVersion").and_then(|value| value.as_str()).unwrap_or(""),
            "stop_reason": "refusal",
            "stop_sequence": Value::Null,
            "usage": build_anthropic_usage(body.get("usageMetadata"))
        }));
    }

    let candidate = body
        .get("candidates")
        .and_then(|value| value.as_array())
        .and_then(|value| value.first())
        .ok_or_else(|| {
            ProxyError::TransformError("No candidates in Gemini response".to_string())
        })?;

    let parts = candidate
        .get("content")
        .and_then(|value| value.get("parts"))
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let mut rectified_parts = parts.clone();
    rectify_tool_call_parts(&mut rectified_parts, tool_schema_hints);

    // Pre-pass: for every `functionCall` that lacks an id (or carries an
    // empty-string id), synthesize one and write it back into
    // `rectified_parts`. Three independent readers — the
    // Anthropic-visible `content[tool_use]` block below, the shadow
    // store's `assistant_content` (cloned from `rectified_parts` further
    // down), and `extract_tool_call_meta(&rectified_parts)` that populates
    // `shadow_turn.tool_calls` — must all see the same id. Otherwise the
    // client would receive id A while the shadow stored id B, and the
    // next round's `tool_result(tool_use_id=A)` would fail to resolve
    // through `tool_name_by_id` (which is built from the shadow), raising
    // `Unable to resolve Gemini functionResponse.name`. Streaming path
    // already has this single-source-of-truth property via
    // `tool_call_snapshots`.
    for part in rectified_parts.iter_mut() {
        let Some(function_call) = part.get_mut("functionCall").and_then(|v| v.as_object_mut())
        else {
            continue;
        };
        let needs_synth = function_call
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.is_empty())
            .unwrap_or(true);
        if needs_synth {
            function_call.insert("id".to_string(), json!(synthesize_tool_call_id()));
        }
    }

    let mut content = Vec::new();
    let mut has_tool_use = false;

    for part in &rectified_parts {
        if part.get("thought").and_then(|value| value.as_bool()) == Some(true) {
            continue;
        }

        if let Some(text) = part.get("text").and_then(|value| value.as_str()) {
            if !text.is_empty() {
                content.push(json!({
                    "type": "text",
                    "text": text
                }));
            }
            continue;
        }

        if let Some(function_call) = part.get("functionCall") {
            has_tool_use = true;
            let id = function_call
                .get("id")
                .and_then(|value| value.as_str())
                .filter(|s| !s.is_empty())
                .map(ToString::to_string)
                .unwrap_or_else(synthesize_tool_call_id);
            content.push(json!({
                "type": "tool_use",
                "id": id,
                "name": function_call.get("name").and_then(|value| value.as_str()).unwrap_or(""),
                "input": function_call.get("args").cloned().unwrap_or_else(|| json!({}))
            }));
        }
    }

    let stop_reason = map_finish_reason(
        candidate
            .get("finishReason")
            .and_then(|value| value.as_str()),
        has_tool_use,
    );

    let anthropic_response = json!({
        "id": body.get("responseId").and_then(|value| value.as_str()).unwrap_or(""),
        "type": "message",
        "role": "assistant",
        "content": content,
        "model": body.get("modelVersion").and_then(|value| value.as_str()).unwrap_or(""),
        "stop_reason": stop_reason,
        "stop_sequence": Value::Null,
        "usage": build_anthropic_usage(body.get("usageMetadata"))
    });

    if let (Some(store), Some(provider_id), Some(session_id), Some(content)) = (
        shadow_store,
        provider_id,
        session_id,
        candidate.get("content"),
    ) {
        let mut shadow_content = content.clone();
        if let Some(parts_value) = shadow_content.get_mut("parts") {
            *parts_value = json!(rectified_parts.clone());
        }
        store.record_assistant_turn(
            provider_id,
            session_id,
            shadow_content,
            extract_tool_call_meta(&rectified_parts),
        );
    }

    Ok(anthropic_response)
}

pub fn extract_gemini_model(body: &Value) -> Option<&str> {
    body.get("model").and_then(|value| value.as_str())
}

fn build_system_instruction(system: Option<&Value>) -> Result<Option<Value>, ProxyError> {
    let Some(system) = system else {
        return Ok(None);
    };

    if let Some(text) = system.as_str() {
        if text.is_empty() {
            return Ok(None);
        }
        return Ok(Some(json!({
            "parts": [{ "text": text }]
        })));
    }

    let Some(blocks) = system.as_array() else {
        return Err(ProxyError::TransformError(
            "Anthropic system must be a string or an array".to_string(),
        ));
    };

    let texts: Vec<&str> = blocks
        .iter()
        .filter_map(|block| block.get("text").and_then(|value| value.as_str()))
        .filter(|text| !text.is_empty())
        .collect();

    if texts.is_empty() {
        return Ok(None);
    }

    Ok(Some(json!({
        "parts": [{ "text": texts.join("\n\n") }]
    })))
}

fn build_generation_config(body: &Value) -> Option<Value> {
    let mut config = Map::new();

    if let Some(value) = body.get("max_tokens") {
        config.insert("maxOutputTokens".to_string(), value.clone());
    }
    if let Some(value) = body.get("temperature") {
        config.insert("temperature".to_string(), value.clone());
    }
    if let Some(value) = body.get("top_p") {
        config.insert("topP".to_string(), value.clone());
    }
    if let Some(value) = body.get("stop_sequences") {
        config.insert("stopSequences".to_string(), value.clone());
    }

    if config.is_empty() {
        None
    } else {
        Some(Value::Object(config))
    }
}

fn convert_messages_to_contents(
    messages: &[Value],
    shadow_turns: &[GeminiAssistantTurn],
) -> Result<Vec<Value>, ProxyError> {
    let mut contents = Vec::new();
    let mut used_shadow_indices = HashSet::new();
    let total_assistant_messages = messages
        .iter()
        .filter(|message| message.get("role").and_then(|value| value.as_str()) == Some("assistant"))
        .count();
    let effective_shadow_turns = if shadow_turns.len() > total_assistant_messages {
        &shadow_turns[shadow_turns.len() - total_assistant_messages..]
    } else {
        shadow_turns
    };

    // Build tool name and thought_signature maps from shadow store.
    // These are used to resolve tool_result→functionResponse names and to
    // attach thought signatures when replaying tool_use→functionCall.
    let mut tool_name_by_id = build_tool_name_map_from_shadow_turns(shadow_turns);
    let mut thought_signature_by_id = build_thought_signature_map_from_shadow_turns(shadow_turns);

    // Pre-scan all assistant messages in the request body to seed
    // tool_name_by_id with every tool_use id mentioned in the conversation
    // history.  This ensures tool_result blocks can always resolve their
    // function name even when the shadow store has aged out the relevant
    // turn (e.g. long conversations, session restarts, or concurrent
    // session churn).
    for message in messages {
        if message.get("role").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }
        if let Some(blocks) = message.get("content").and_then(|c| c.as_array()) {
            for block in blocks {
                if block.get("type").and_then(|v| v.as_str()) != Some("tool_use") {
                    continue;
                }
                let id = block.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if !id.is_empty() && !name.is_empty() {
                    tool_name_by_id
                        .entry(id.to_string())
                        .or_insert_with(|| name.to_string());
                }
            }
        }
    }

    let shadow_start_index = total_assistant_messages.saturating_sub(effective_shadow_turns.len());
    let mut assistant_seen_index = 0usize;

    for message in messages {
        let role = message
            .get("role")
            .and_then(|value| value.as_str())
            .unwrap_or("user");

        let gemini_role = if role == "assistant" { "model" } else { "user" };

        let parts = if role == "assistant" {
            let positional_shadow_index = assistant_seen_index
                .checked_sub(shadow_start_index)
                .filter(|index| *index < effective_shadow_turns.len())
                .filter(|index| !used_shadow_indices.contains(index));
            let tool_use_match_index = find_matching_shadow_turn_for_assistant_message(
                message.get("content"),
                effective_shadow_turns,
            )
            .filter(|index| !used_shadow_indices.contains(index));
            assistant_seen_index += 1;
            let shadow_index = tool_use_match_index.or(positional_shadow_index);

            if let Some(index) = shadow_index {
                used_shadow_indices.insert(index);
                let shadow_turn = &effective_shadow_turns[index];
                merge_tool_names_from_shadow(shadow_turn, &mut tool_name_by_id);
                merge_thought_signatures_from_shadow(shadow_turn, &mut thought_signature_by_id);
                if let Some(parts) = shadow_parts(&shadow_turn.assistant_content) {
                    parts
                } else {
                    convert_message_content_to_parts(
                        message.get("content"),
                        role,
                        &mut tool_name_by_id,
                        &thought_signature_by_id,
                    )?
                }
            } else {
                convert_message_content_to_parts(
                    message.get("content"),
                    role,
                    &mut tool_name_by_id,
                    &thought_signature_by_id,
                )?
            }
        } else {
            convert_message_content_to_parts(
                message.get("content"),
                role,
                &mut tool_name_by_id,
                &thought_signature_by_id,
            )?
        };

        if role == "assistant" {
            merge_tool_names_from_parts(&parts, &mut tool_name_by_id);
        }

        contents.push(json!({
            "role": gemini_role,
            "parts": parts
        }));
    }

    Ok(contents)
}

fn find_matching_shadow_turn_for_assistant_message(
    content: Option<&Value>,
    shadow_turns: &[GeminiAssistantTurn],
) -> Option<usize> {
    let (tool_use_ids, tool_use_names) = extract_assistant_tool_use_keys(content);
    if tool_use_ids.is_empty() && tool_use_names.is_empty() {
        return None;
    }

    // Prefer exact tool-call id match. With identical tool suffixes across
    // servers (e.g. `server_a:search` and `server_b:search`) the
    // normalized-name clause below would otherwise match an earlier shadow
    // turn whose id is actually wrong for this message, mis-routing replay
    // state (functionCall id / thoughtSignature) for later tool_result
    // resolution. Only fall back to name matching when id-based lookup fails
    // or when the incoming message carries no ids at all.
    if !tool_use_ids.is_empty() {
        if let Some(index) = shadow_turns.iter().position(|turn| {
            turn.tool_calls.iter().any(|tool_call| {
                tool_call
                    .id
                    .as_deref()
                    .is_some_and(|id| tool_use_ids.contains(id))
            })
        }) {
            return Some(index);
        }
    }

    shadow_turns.iter().enumerate().find_map(|(index, turn)| {
        turn.tool_calls
            .iter()
            .any(|tool_call| {
                tool_use_names.contains(tool_call.name.as_str())
                    || tool_use_names.contains(normalize_tool_name(&tool_call.name))
            })
            .then_some(index)
    })
}

fn extract_assistant_tool_use_keys(content: Option<&Value>) -> (HashSet<String>, HashSet<String>) {
    let mut tool_use_ids = HashSet::new();
    let mut tool_use_names = HashSet::new();
    let Some(blocks) = content.and_then(|value| value.as_array()) else {
        return (tool_use_ids, tool_use_names);
    };

    for block in blocks {
        if block.get("type").and_then(|value| value.as_str()) != Some("tool_use") {
            continue;
        }

        if let Some(id) = block
            .get("id")
            .and_then(|value| value.as_str())
            .filter(|id| !id.is_empty())
        {
            tool_use_ids.insert(id.to_string());
        }

        if let Some(name) = block
            .get("name")
            .and_then(|value| value.as_str())
            .filter(|name| !name.is_empty())
        {
            tool_use_names.insert(name.to_string());
            tool_use_names.insert(normalize_tool_name(name).to_string());
        }
    }

    (tool_use_ids, tool_use_names)
}

fn normalize_tool_name(name: &str) -> &str {
    name.rsplit(':').next().unwrap_or(name)
}

fn convert_message_content_to_parts(
    content: Option<&Value>,
    role: &str,
    tool_name_by_id: &mut std::collections::HashMap<String, String>,
    thought_signature_by_id: &std::collections::HashMap<String, String>,
) -> Result<Vec<Value>, ProxyError> {
    let Some(content) = content else {
        return Ok(Vec::new());
    };

    if let Some(text) = content.as_str() {
        return Ok(vec![json!({ "text": text })]);
    }

    let Some(blocks) = content.as_array() else {
        return Err(ProxyError::TransformError(
            "Anthropic message content must be a string or array".to_string(),
        ));
    };

    let mut parts = Vec::new();

    for block in blocks {
        let block_type = block
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("");

        match block_type {
            "text" => {
                if let Some(text) = block.get("text").and_then(|value| value.as_str()) {
                    parts.push(json!({ "text": text }));
                }
            }
            "image" => {
                let source = block.get("source").ok_or_else(|| {
                    ProxyError::TransformError("Gemini image block missing source".to_string())
                })?;

                let source_type = source
                    .get("type")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");

                if source_type != "base64" {
                    return Err(ProxyError::TransformError(format!(
                        "Gemini Native only supports base64 image sources, got `{source_type}`"
                    )));
                }

                parts.push(json!({
                    "inlineData": {
                        "mimeType": source.get("media_type").and_then(|value| value.as_str()).unwrap_or("image/png"),
                        "data": source.get("data").and_then(|value| value.as_str()).unwrap_or("")
                    }
                }));
            }
            "document" => {
                let source = block.get("source").ok_or_else(|| {
                    ProxyError::TransformError("Gemini document block missing source".to_string())
                })?;

                let source_type = source
                    .get("type")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");

                if source_type != "base64" {
                    return Err(ProxyError::TransformError(format!(
                        "Gemini Native only supports base64 document sources, got `{source_type}`"
                    )));
                }

                parts.push(json!({
                    "inlineData": {
                        "mimeType": source.get("media_type").and_then(|value| value.as_str()).unwrap_or("application/pdf"),
                        "data": source.get("data").and_then(|value| value.as_str()).unwrap_or("")
                    }
                }));
            }
            "tool_use" => {
                if role != "assistant" {
                    return Err(ProxyError::TransformError(
                        "tool_use blocks are only valid in assistant messages".to_string(),
                    ));
                }

                let id = block
                    .get("id")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                let name = block
                    .get("name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                if !id.is_empty() && !name.is_empty() {
                    tool_name_by_id.insert(id.to_string(), name.to_string());
                }

                // A synthesized id is an internal proxy identifier — never
                // forward it to Gemini. Gemini will disambiguate the missing
                // id by call order, matching its own earlier response shape.
                let mut function_call = json!({
                    "name": name,
                    "args": block.get("input").cloned().unwrap_or_else(|| json!({}))
                });
                if !id.is_empty() && !is_synthesized_tool_call_id(id) {
                    function_call["id"] = json!(id);
                }

                // Re-attach the thought_signature that Gemini originally
                // associated with this functionCall.  The Anthropic format
                // strips it from the tool_use block, but Gemini requires it
                // on every functionCall in a multi-turn tool-use exchange.
                // Without replaying the stored signature the upstream may
                // reject with "missing a `thought_signature`".
                if let Some(sig) = thought_signature_by_id.get(id) {
                    function_call["thoughtSignature"] = json!(sig);
                }

                parts.push(json!({ "functionCall": function_call }));
            }
            "tool_result" => {
                let tool_use_id = block
                    .get("tool_use_id")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                let name = tool_name_by_id
                    .get(tool_use_id)
                    .cloned()
                    .or_else(|| {
                        // Last-resort fallback: scan every block in this content
                        // array for a tool_use whose id matches.  This catches
                        // edge cases where the tool_use lives in a different
                        // content block of the same message (non-standard client
                        // behaviour) or in a re-ordered message array.
                        blocks.iter().find_map(|b| {
                            let t = b.get("type").and_then(|v| v.as_str())?;
                            if t != "tool_use" { return None; }
                            let id = b.get("id").and_then(|v| v.as_str())?;
                            if id != tool_use_id { return None; }
                            b.get("name").and_then(|v| v.as_str()).map(|n| n.to_string())
                        })
                    })
                    .ok_or_else(|| {
                        ProxyError::TransformError(format!(
                            "Unable to resolve Gemini functionResponse.name for tool_use_id `{tool_use_id}`"
                        ))
                    })?;

                // See `tool_use` above: synthesized ids must not leak upstream.
                let mut function_response = json!({
                    "name": name,
                    "response": normalize_tool_result_response(block.get("content"))
                });
                if !tool_use_id.is_empty() && !is_synthesized_tool_call_id(tool_use_id) {
                    function_response["id"] = json!(tool_use_id);
                }

                parts.push(json!({ "functionResponse": function_response }));
            }
            "thinking" | "redacted_thinking" => {}
            _ => {}
        }
    }

    Ok(parts)
}

fn normalize_tool_result_response(content: Option<&Value>) -> Value {
    match content {
        Some(Value::String(text)) => json!({ "content": text }),
        Some(Value::Array(blocks)) => {
            let texts: Vec<&str> = blocks
                .iter()
                .filter(|block| block.get("type").and_then(|value| value.as_str()) == Some("text"))
                .filter_map(|block| block.get("text").and_then(|value| value.as_str()))
                .collect();

            if texts.is_empty() {
                json!({ "content": Value::Array(blocks.clone()) })
            } else {
                json!({ "content": texts.join("\n") })
            }
        }
        Some(value) => json!({ "content": value.clone() }),
        None => json!({ "content": "" }),
    }
}

fn shadow_parts(content: &Value) -> Option<Vec<Value>> {
    let mut parts = content
        .get("parts")
        .and_then(|value| value.as_array())
        .cloned()
        .or_else(|| content.as_array().cloned())?;
    // Strip synthesized ids before these parts are replayed into a Gemini
    // request body. The shadow store records the Anthropic-facing id so that
    // a tool_result round-trip can find the tool's name, but sending the
    // synthetic value as `functionCall.id` upstream would leak an internal
    // identifier.
    for part in &mut parts {
        let Some(function_call) = part.get_mut("functionCall").and_then(|v| v.as_object_mut())
        else {
            continue;
        };
        let drop_id = function_call
            .get("id")
            .and_then(|v| v.as_str())
            .map(|id| id.is_empty() || is_synthesized_tool_call_id(id))
            .unwrap_or(true);
        if drop_id {
            function_call.remove("id");
        }
    }
    Some(parts)
}

pub fn extract_anthropic_tool_schema_hints(body: &Value) -> AnthropicToolSchemaHints {
    body.get("tools")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            let name = tool.get("name").and_then(|value| value.as_str())?;
            let input_schema = tool
                .get("input_schema")
                .and_then(|value| value.as_object())?;
            let properties = input_schema
                .get("properties")
                .and_then(|value| value.as_object())?;
            if properties.is_empty() {
                return None;
            }

            let expected_keys = properties.keys().cloned().collect::<Vec<_>>();
            let required_keys = input_schema
                .get("required")
                .and_then(|value| value.as_array())
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|value| value.as_str().map(ToString::to_string))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            Some((
                name.to_string(),
                AnthropicToolSchemaHint {
                    expected_keys,
                    required_keys,
                },
            ))
        })
        .collect()
}

pub fn rectify_tool_call_parts(
    parts: &mut [Value],
    tool_schema_hints: Option<&AnthropicToolSchemaHints>,
) {
    for part in parts {
        let Some(function_call) = part
            .get_mut("functionCall")
            .and_then(|value| value.as_object_mut())
        else {
            continue;
        };
        let Some(name) = function_call
            .get("name")
            .and_then(|value| value.as_str())
            .map(ToString::to_string)
        else {
            continue;
        };
        let Some(args) = function_call.get_mut("args") else {
            continue;
        };

        if rectify_tool_call_args(&name, args, tool_schema_hints) {
            log::info!("[Claude/Gemini] Rectified tool args for `{name}`");
        }
    }
}

pub fn rectify_tool_call_args(
    tool_name: &str,
    args: &mut Value,
    tool_schema_hints: Option<&AnthropicToolSchemaHints>,
) -> bool {
    let Some(tool_schema_hints) = tool_schema_hints else {
        return false;
    };
    let Some(hint) = tool_schema_hints.get(tool_name) else {
        return false;
    };
    let Some(args_object) = args.as_object_mut() else {
        return false;
    };
    if args_object.is_empty() || hint.expected_keys.is_empty() {
        return false;
    }
    let mut changed = false;

    if hint.expected_keys.iter().any(|key| key == "skill") && !args_object.contains_key("skill") {
        if let Some(value) = args_object.remove("name") {
            args_object.insert("skill".to_string(), value);
            changed = true;
        }
    }

    let expects_parameters_key = hint.expected_keys.iter().any(|key| key == "parameters");
    if !expects_parameters_key {
        let extracted_parameters = args_object
            .get("parameters")
            .and_then(|value| value.as_object())
            .map(|parameters_object| {
                hint.expected_keys
                    .iter()
                    .filter_map(|expected_key| {
                        if args_object.contains_key(expected_key) {
                            return None;
                        }
                        let value = parameters_object.get(expected_key)?;
                        let normalized_value = match value {
                            Value::Array(values) if values.len() == 1 => values[0].clone(),
                            _ => value.clone(),
                        };
                        Some((expected_key.clone(), normalized_value))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if !extracted_parameters.is_empty() {
            for (expected_key, normalized_value) in extracted_parameters {
                args_object.insert(expected_key, normalized_value);
            }
            args_object.remove("parameters");
            changed = true;
        }
    }

    if hint
        .required_keys
        .iter()
        .all(|key| args_object.contains_key(key.as_str()))
    {
        return changed;
    }

    let expected_key_set = hint
        .expected_keys
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let unexpected_keys = args_object
        .keys()
        .filter(|key| !expected_key_set.contains(key.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if unexpected_keys.len() != 1 {
        return false;
    }

    let target_key = hint
        .required_keys
        .iter()
        .find(|key| !args_object.contains_key(key.as_str()))
        .cloned()
        .or_else(|| {
            if hint.expected_keys.len() == 1 && args_object.len() == 1 {
                hint.expected_keys.first().cloned()
            } else {
                None
            }
        });
    let Some(target_key) = target_key else {
        return false;
    };
    if args_object.contains_key(&target_key) {
        return false;
    }

    let source_key = &unexpected_keys[0];
    let Some(value) = args_object.remove(source_key) else {
        return false;
    };
    args_object.insert(target_key, value);
    true
}

fn merge_tool_names_from_shadow(
    turn: &GeminiAssistantTurn,
    tool_name_by_id: &mut HashMap<String, String>,
) {
    for tool_call in &turn.tool_calls {
        if let Some(id) = &tool_call.id {
            tool_name_by_id.insert(id.clone(), tool_call.name.clone());
        }
    }

    if let Some(parts) = shadow_parts(&turn.assistant_content) {
        merge_tool_names_from_parts(&parts, tool_name_by_id);
    }
}

fn build_tool_name_map_from_shadow_turns(
    shadow_turns: &[GeminiAssistantTurn],
) -> HashMap<String, String> {
    let mut tool_name_by_id = HashMap::new();
    for turn in shadow_turns {
        merge_tool_names_from_shadow(turn, &mut tool_name_by_id);
    }
    tool_name_by_id
}

fn build_thought_signature_map_from_shadow_turns(
    shadow_turns: &[GeminiAssistantTurn],
) -> HashMap<String, String> {
    let mut thought_signature_by_id = HashMap::new();
    for turn in shadow_turns {
        merge_thought_signatures_from_shadow(turn, &mut thought_signature_by_id);
    }
    thought_signature_by_id
}

fn merge_thought_signatures_from_shadow(
    turn: &GeminiAssistantTurn,
    thought_signature_by_id: &mut HashMap<String, String>,
) {
    for tool_call in &turn.tool_calls {
        if let (Some(id), Some(sig)) = (&tool_call.id, &tool_call.thought_signature) {
            thought_signature_by_id.insert(id.clone(), sig.clone());
        }
    }
}

fn merge_tool_names_from_parts(parts: &[Value], tool_name_by_id: &mut HashMap<String, String>) {
    for part in parts {
        let Some(function_call) = part.get("functionCall") else {
            continue;
        };
        let Some(id) = function_call.get("id").and_then(|value| value.as_str()) else {
            continue;
        };
        let Some(name) = function_call.get("name").and_then(|value| value.as_str()) else {
            continue;
        };
        if !id.is_empty() && !name.is_empty() {
            tool_name_by_id.insert(id.to_string(), name.to_string());
        }
    }
}

fn extract_tool_call_meta(parts: &[Value]) -> Vec<GeminiToolCallMeta> {
    parts
        .iter()
        .filter_map(|part| {
            let function_call = part.get("functionCall")?;
            // Ensure every surfaced tool call carries a distinguishing id.
            // Gemini 2.x may omit `id` on parallel calls; synthesizing a
            // unique replacement prevents downstream merge/replay logic from
            // collapsing distinct calls onto a single empty-string key.
            let id = function_call
                .get("id")
                .and_then(|value| value.as_str())
                .filter(|s| !s.is_empty())
                .map(ToString::to_string)
                .unwrap_or_else(synthesize_tool_call_id);
            Some(GeminiToolCallMeta::new(
                Some(id),
                function_call
                    .get("name")
                    .and_then(|value| value.as_str())
                    .unwrap_or(""),
                function_call
                    .get("args")
                    .cloned()
                    .unwrap_or_else(|| json!({})),
                part.get("thoughtSignature")
                    .or_else(|| part.get("thought_signature"))
                    .and_then(|value| value.as_str()),
            ))
        })
        .collect()
}

fn map_tool_choice(tool_choice: Option<&Value>) -> Result<Option<Value>, ProxyError> {
    let Some(tool_choice) = tool_choice else {
        return Ok(None);
    };

    match tool_choice {
        Value::String(choice) => Ok(match choice.as_str() {
            "auto" => Some(json!({
                "functionCallingConfig": { "mode": "AUTO" }
            })),
            "none" => Some(json!({
                "functionCallingConfig": { "mode": "NONE" }
            })),
            other => {
                return Err(ProxyError::TransformError(format!(
                    "Unsupported Gemini tool_choice string: {other}"
                )));
            }
        }),
        Value::Object(object) => {
            let Some(choice_type) = object.get("type").and_then(|value| value.as_str()) else {
                return Ok(None);
            };

            let config = match choice_type {
                "auto" => json!({ "mode": "AUTO" }),
                "none" => json!({ "mode": "NONE" }),
                "any" => json!({ "mode": "ANY" }),
                "tool" => {
                    let name = object
                        .get("name")
                        .and_then(|value| value.as_str())
                        .unwrap_or("");
                    json!({
                        "mode": "ANY",
                        "allowedFunctionNames": [name]
                    })
                }
                other => {
                    return Err(ProxyError::TransformError(format!(
                        "Unsupported Gemini tool_choice type: {other}"
                    )));
                }
            };

            Ok(Some(json!({ "functionCallingConfig": config })))
        }
        _ => Ok(None),
    }
}

/// Convert a Gemini `usageMetadata` object into an Anthropic-style `usage`
/// object. Used by both the streaming SSE converter and the non-streaming
/// transform path so the two emit identical shapes.
pub(crate) fn build_anthropic_usage(usage: Option<&Value>) -> Value {
    let Some(usage) = usage else {
        return json!({
            "input_tokens": 0,
            "output_tokens": 0
        });
    };

    let input_tokens = usage
        .get("promptTokenCount")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    let total_tokens = usage
        .get("totalTokenCount")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    let output_tokens = total_tokens.saturating_sub(input_tokens);

    let mut result = json!({
        "input_tokens": input_tokens,
        "output_tokens": output_tokens
    });

    if let Some(cached) = usage
        .get("cachedContentTokenCount")
        .and_then(|value| value.as_u64())
    {
        result["cache_read_input_tokens"] = json!(cached);
    }

    result
}

fn map_finish_reason(reason: Option<&str>, has_tool_use: bool) -> Value {
    let mapped = match reason {
        Some("MAX_TOKENS") => Some("max_tokens"),
        Some("STOP") | Some("FINISH_REASON_UNSPECIFIED") | None => {
            if has_tool_use {
                Some("tool_use")
            } else {
                Some("end_turn")
            }
        }
        Some("SAFETY")
        | Some("RECITATION")
        | Some("SPII")
        | Some("BLOCKLIST")
        | Some("PROHIBITED_CONTENT") => Some("refusal"),
        Some(other) => {
            log::warn!("[Claude/Gemini] Unknown Gemini finishReason `{other}`, using end_turn");
            Some("end_turn")
        }
    };

    match mapped {
        Some(value) => json!(value),
        None => Value::Null,
    }
}

