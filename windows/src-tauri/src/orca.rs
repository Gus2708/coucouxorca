//! Read-only Orca telemetry. No binding, dispatch, inbox, or lifecycle mutations.
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    id: String,
    objective: String,
    coordinator_handle: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Coordinator {
    handle: String,
    cwd: Option<String>,
    connected: bool,
    provider: Option<String>,
    pane_key: Option<String>,
    activity: Option<Activity>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    state: String,
    step: Option<String>,
    updated_at: u64,
    final_response: Option<String>,
    prompt: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worker {
    id: String,
    task_id: String,
    name: String,
    state: String,
    cwd: Option<String>,
    terminal_handle: String,
    pane_key: Option<String>,
    provider: Option<String>,
    settled: bool,
    activity: Option<Activity>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    runs: Vec<Run>,
    selected_run: Option<Run>,
    coordinator: Option<Coordinator>,
    workers: Vec<Worker>,
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key)?.as_str().filter(|s| !s.is_empty())
}

fn pane_key(terminal: &Value) -> Option<String> {
    Some(format!(
        "{}:{}",
        text(terminal, "tabId")?,
        text(terminal, "leafId")?
    ))
}

fn project_activity(rows: &[Value], key: &str, now: u64) -> Option<Activity> {
    let row = rows.iter().find(|r| text(r, "paneKey") == Some(key))?;
    // Antigravity rows in Orca worktree ps report state on the root row without a
    // nested mainAgent object; Claude/Codex rows carry mainAgent separately from children.
    let main = if row["mainAgent"].is_object() {
        &row["mainAgent"]
    } else {
        row
    };
    let raw_state = text(main, "state").or_else(|| text(row, "state"))?;
    let row_updated_at = row["updatedAt"].as_u64()?;
    let state_started_at = main["stateStartedAt"]
        .as_u64()
        .or_else(|| row["stateStartedAt"].as_u64());
    // Aggregate updates can come from children after the lead finishes; a settled
    // lead's own completion timestamp must be current, while active turns stay fresh
    // as long as their pane row keeps updating.
    let updated_at = if raw_state == "done" {
        row_updated_at.min(state_started_at?)
    } else {
        row_updated_at
    };
    if updated_at > now + 5000 || now.saturating_sub(updated_at) > 60000 {
        return None;
    }
    let state = match raw_state {
        "working" if text(row, "toolName").is_some() => "working",
        "working" => "thinking",
        "blocked" => "approval",
        "waiting" => "question",
        "done" if text(main, "outcome").or_else(|| text(row, "outcome")) == Some("failure") => {
            "error"
        }
        "done" if row["interrupted"] == true => "idle",
        "done" => "finished",
        _ => return None,
    };
    let tool_input = text(row, "toolInput").or_else(|| {
        let input = &row["toolInput"];
        text(input, "command")
            .or_else(|| text(input, "CommandLine"))
            .or_else(|| text(input, "cmd"))
            .or_else(|| text(input, "file_path"))
            .or_else(|| text(input, "TargetFile"))
            .or_else(|| text(input, "AbsolutePath"))
            .or_else(|| text(input, "path"))
    });
    Some(Activity {
        state: state.into(),
        step: text(row, "toolName").map(|tool| {
            let input = tool_input.unwrap_or("");
            if input.is_empty() {
                tool.to_string()
            } else {
                format!(
                    "{tool} \u{b7} {}",
                    input.chars().take(180).collect::<String>()
                )
            }
        }),
        prompt: text(row, "prompt").map(|s| s.chars().take(160).collect()),
        updated_at,
        final_response: (state == "finished" && row["lastAssistantMessageIsToolOutput"] != true)
            .then(|| text(row, "lastAssistantMessage").map(|s| s.chars().take(12000).collect()))
            .flatten(),
    })
}

fn extract_final_response(value: &Value, dispatch: &str) -> Option<String> {
    if text(value, "source") != Some("transcript")
        || value["sourceExact"] != true
        || value["contentComplete"] != true
        || text(&value["projection"], "dispatchId") != Some(dispatch)
        || !matches!(
            text(&value["projection"], "outcome"),
            Some("succeeded" | "failed")
        )
    {
        return None;
    }
    let last = value["transcript"]["messages"].as_array()?.last()?;
    if text(last, "role") != Some("assistant")
        || matches!(text(last, "phase"), Some("commentary" | "analysis"))
    {
        return None;
    }
    let blocks = last["blocks"].as_array()?;
    if blocks.iter().any(|b| text(b, "type") != Some("text")) {
        return None;
    }
    let response = blocks
        .iter()
        .filter_map(|b| text(b, "text"))
        .collect::<Vec<_>>()
        .join("\n\n");
    (!response.trim().is_empty()).then(|| response.chars().take(12000).collect())
}

pub fn completion(dispatch: String) -> Result<Option<String>, String> {
    if dispatch.is_empty() || dispatch.len() > 200 {
        return Err("Invalid Orca Dispatch identity".into());
    }
    let result = query(&[
        "orchestration",
        "worker-read",
        "--dispatch",
        &dispatch,
        "--source",
        "transcript",
        "--limit",
        "200",
    ])?;
    Ok(extract_final_response(&result, &dispatch))
}

fn executable() -> PathBuf {
    if let Some(path) = std::env::var_os("ORCA_CLI_COMMAND").filter(|p| !p.is_empty()) {
        return PathBuf::from(path);
    }
    if std::env::var_os("ORCA_DEV_REPO_ROOT").is_some() {
        return PathBuf::from("orca-dev");
    }
    #[cfg(windows)]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let installed = PathBuf::from(local).join("Programs/orca/resources/bin/orca.exe");
        if installed.is_file() {
            return installed;
        }
    }
    #[cfg(target_os = "linux")]
    {
        PathBuf::from("orca-ide")
    }
    #[cfg(not(target_os = "linux"))]
    {
        PathBuf::from("orca")
    }
}

/// Every invocation has a deadline and a bounded output buffer, without a shell.
fn query(args: &[&str]) -> Result<Value, String> {
    let mut command = Command::new(executable());
    command
        .args(args)
        .arg("--json")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::platform::no_console(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "Orca CLI is unavailable".to_string())?;
    let stdout = child.stdout.take().ok_or("Orca output is unavailable")?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(4 * 1024 * 1024 + 1).read_to_end(&mut bytes);
        let _ = tx.send((result, bytes));
    });
    let budget = if args.first() == Some(&"open") { 30 } else { 6 };
    let until = Instant::now() + Duration::from_secs(budget);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < until => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Orca did not respond within {budget} seconds"));
            }
        }
    };
    let (read, bytes) = rx
        .recv_timeout(Duration::from_secs(1))
        .map_err(|_| "Orca output did not finish")?;
    if read.is_err() || bytes.len() > 4 * 1024 * 1024 {
        return Err("Orca output exceeds the telemetry limit".into());
    }
    let envelope: Value =
        serde_json::from_slice(&bytes).map_err(|_| "Orca returned invalid telemetry")?;
    if !status.success() || envelope["ok"] != true {
        return Err("Orca telemetry is unavailable; open Orca to reconnect".into());
    }
    envelope
        .get("result")
        .cloned()
        .ok_or_else(|| "Orca telemetry has no result".into())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    opened: bool,
    terminal_focused: bool,
}

fn open_activated(
    handle: Option<&str>,
    mut invoke: impl FnMut(&[&str]) -> Result<Value, String>,
    mut activate: impl FnMut() -> bool,
) -> Result<OpenResult, String> {
    // Restore first, while the button click can still grant foreground permission.
    if !activate() {
        invoke(&["open"])?;
        if !activate() {
            return Err(
                "Orca is running, but Windows did not confirm foreground activation".into(),
            );
        }
    }
    // Expired terminal selection does not change another task or fail app activation.
    let focused = handle
        .filter(|h| !h.is_empty())
        .is_some_and(|h| invoke(&["terminal", "switch", "--terminal", h]).is_ok());
    if !activate() {
        return Err("Windows did not confirm Orca foreground activation".into());
    }
    Ok(OpenResult {
        opened: true,
        terminal_focused: focused,
    })
}

pub fn activate_desktop() -> bool {
    #[cfg(target_os = "windows")]
    {
        let exe = executable();
        let Some(directory) = exe
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
        else {
            return false;
        };
        return crate::platform::activate_application(&directory.join("Orca.exe"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

pub fn open_terminal(
    handle: Option<String>,
    _coordinator: Option<String>,
) -> Result<OpenResult, String> {
    let outcome = open_activated(handle.as_deref(), query, activate_desktop);
    if let Err(ref error) = outcome {
        crate::log::line(format!("Open Orca failed: {error}"));
    } else if outcome.as_ref().is_ok_and(|r| !r.terminal_focused) {
        crate::log::line("Orca opened; requested terminal was unavailable");
    }
    outcome
}

fn canonical_provider(p: &str) -> Option<&'static str> {
    let s = p.trim().to_lowercase();
    match s.as_str() {
        "antigravity" | "gemini" => Some("antigravity"),
        "claude" => Some("claude"),
        "codex" => Some("codex"),
        "opencode" => Some("opencode"),
        "pi" => Some("pi"),
        "omp" => Some("omp"),
        "grok" => Some("grok"),
        _ => None,
    }
}

fn normalize_provider(p: &str) -> String {
    canonical_provider(p)
        .map(str::to_string)
        .unwrap_or_else(|| p.trim().to_lowercase())
}

fn resolve_worker_provider(
    row: &Value,
    projection: &Value,
    terminal: Option<&Value>,
) -> Option<String> {
    let candidates = [
        text(&projection["provider"], "id"),
        text(&projection["provider"], "provider"),
        text(&projection["provider"], "name"),
        projection["provider"].as_str().filter(|s| !s.is_empty()),
        terminal.and_then(|t| text(t, "agentIdentity")),
        text(row, "provider"),
        text(&row["resource"], "agentIdentity"),
    ];
    if let Some(canonical) = candidates
        .into_iter()
        .flatten()
        .find_map(canonical_provider)
    {
        return Some(canonical.into());
    }
    candidates
        .into_iter()
        .flatten()
        .next()
        .map(normalize_provider)
}

fn project_workers(
    rows: &[Value],
    run_id: &str,
    names: &HashMap<String, String>,
    terminals: &[Value],
) -> Vec<Worker> {
    let mut workers: Vec<Worker> = Vec::new();
    let mut by_task: HashMap<String, usize> = HashMap::new();
    for row in rows {
        let projection = &row["projection"];
        let row_run = text(row, "runId").or_else(|| text(projection, "runId"));
        if row_run != Some(run_id) {
            continue;
        }
        let role = text(projection, "role").or_else(|| text(row, "role"));
        if !matches!(role, Some("worker" | "subagent" | "agent") | None) {
            continue;
        }
        // Terminal accounting is separate from Task/Dispatch lifecycle. Retained
        // user-owned terminals can still be the coordinator's current workers.
        let status = text(row, "dispatchStatus").unwrap_or("");
        let id = text(row, "dispatchId").or_else(|| text(projection, "dispatchId"));
        let task_id = text(row, "taskId").or_else(|| text(projection, "taskId"));
        let (Some(id), Some(task_id)) = (id, task_id) else {
            continue;
        };
        let stage = &projection["stage"];
        let outcome = text(projection, "outcome").unwrap_or("");
        let settled = matches!(
            status,
            "completed" | "failed" | "abandoned" | "stopped" | "cancelled"
        ) || matches!(outcome, "succeeded" | "failed")
            || text(stage, "worker") == Some("failed");
        if !settled && text(row, "terminalState") == Some("released") {
            continue;
        }
        let handle = text(row, "agentTerminalHandle")
            .or_else(|| text(&row["resource"], "terminalHandle"))
            .unwrap_or("");
        let liveness = text(&projection["liveness"], "verdict").unwrap_or("unverifiable");
        let activity = text(stage, "activity").unwrap_or("unknown");
        let state = if status == "completed" || outcome == "succeeded" {
            "finished"
        } else if matches!(status, "failed" | "abandoned" | "stopped" | "cancelled")
            || outcome == "failed"
            || text(stage, "worker") == Some("failed")
            || liveness == "exited"
        {
            "error"
        } else if liveness != "live" {
            "idle"
        } else if matches!(activity, "approval" | "permission" | "permission_required") {
            "approval"
        } else if matches!(activity, "question" | "waiting_for_input") {
            "question"
        } else if matches!(activity, "thinking" | "starting") {
            "thinking"
        } else if matches!(activity, "idle" | "waiting" | "done") {
            "idle"
        } else {
            "working"
        };
        let terminal = terminals.iter().find(|t| text(t, "handle") == Some(handle));
        let worker = Worker {
            id: id.to_string(),
            task_id: task_id.to_string(),
            name: names
                .get(task_id)
                .cloned()
                .unwrap_or_else(|| task_id.to_string()),
            state: state.into(),
            cwd: terminal
                .and_then(|t| text(t, "worktreePath"))
                .map(str::to_string),
            terminal_handle: handle.to_string(),
            pane_key: terminal.and_then(pane_key),
            provider: resolve_worker_provider(row, projection, terminal),
            settled,
            activity: None,
        };

        if let Some(&idx) = by_task.get(task_id) {
            let existing = &workers[idx];
            // An active (non-settled) worker always takes precedence over a settled one.
            if existing.settled && !worker.settled {
                workers[idx] = worker;
            }
        } else {
            by_task.insert(task_id.to_string(), workers.len());
            workers.push(worker);
        }
    }
    workers
}

pub fn snapshot(selected: Option<String>) -> Result<Snapshot, String> {
    let inventory = query(&["orchestration", "run-list"])?;
    let terminal_inventory = query(&["terminal", "list", "--limit", "100"])?;
    if terminal_inventory["truncated"] == true {
        return Err("Orca terminal inventory is incomplete".into());
    }
    let terminals = terminal_inventory["terminals"]
        .as_array()
        .ok_or("Orca terminal inventory is unavailable")?;
    let activity_inventory = query(&["worktree", "ps", "--limit", "100"]).ok();
    let activity_rows: Vec<Value> = activity_inventory
        .as_ref()
        .filter(|v| v["truncated"] != true)
        .and_then(|v| v["worktrees"].as_array())
        .into_iter()
        .flatten()
        .flat_map(|w| w["agents"].as_array().into_iter().flatten().cloned())
        .collect();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let mut runs: Vec<Run> = inventory["runs"]
        .as_array()
        .ok_or("Orca Run inventory is unavailable")?
        .iter()
        .filter_map(|row| {
            if row["legacy"] == 1 {
                return None;
            }
            Some(Run {
                id: text(row, "id")?.into(),
                objective: text(row, "objective").unwrap_or("Orca Run").into(),
                coordinator_handle: text(row, "coordinator_handle")?.into(),
            })
        })
        .collect();
    // Synthesize standalone terminal entries for connected agent terminals that are not
    // already Run coordinators, so Coucou works even when the user works without `run-create`.
    for term in terminals {
        if term["connected"] != true {
            continue;
        }
        let Some(handle) = text(term, "handle") else {
            continue;
        };
        if runs.iter().any(|r| r.coordinator_handle == handle) {
            continue;
        }
        let has_agent = text(term, "agentIdentity").is_some()
            || pane_key(term)
                .as_deref()
                .is_some_and(|key| activity_rows.iter().any(|r| text(r, "paneKey") == Some(key)));
        if !has_agent {
            continue;
        }
        let label = text(term, "title")
            .or_else(|| {
                text(term, "worktreePath").and_then(|p| {
                    p.trim_end_matches(['/', '\\'])
                        .rsplit(['/', '\\'])
                        .next()
                        .filter(|s| !s.is_empty())
                })
            })
            .unwrap_or(handle);
        runs.push(Run {
            id: format!("term:{handle}"),
            objective: label.into(),
            coordinator_handle: handle.into(),
        });
    }
    let is_connected = |r: &Run| {
        terminals
            .iter()
            .any(|t| text(t, "handle") == Some(&r.coordinator_handle) && t["connected"] == true)
    };
    let is_active = |r: &Run| {
        let coord_active = terminals
            .iter()
            .find(|t| text(t, "handle") == Some(&r.coordinator_handle) && t["connected"] == true)
            .and_then(pane_key)
            .and_then(|key| project_activity(&activity_rows, &key, now))
            .is_some_and(|a| !matches!(a.state.as_str(), "idle" | "finished"));
        if coord_active {
            return true;
        }
        let Some(run_path) = terminals
            .iter()
            .find(|t| text(t, "handle") == Some(&r.coordinator_handle))
            .and_then(|t| text(t, "worktreePath"))
        else {
            return false;
        };
        terminals
            .iter()
            .filter(|t| text(t, "worktreePath") == Some(run_path) && t["connected"] == true)
            .filter_map(pane_key)
            .any(|key| {
                project_activity(&activity_rows, &key, now)
                    .is_some_and(|a| !matches!(a.state.as_str(), "idle" | "finished"))
            })
    };
    // Retain an exact requested binding. Otherwise prefer an actively working connected Run,
    // then any connected orchestration Run, then any active/connected standalone agent terminal.
    let chosen = if let Some(id) = selected {
        runs.iter().find(|r| r.id == id).cloned()
    } else {
        runs.iter()
            .find(|r| !r.id.starts_with("term:") && is_active(r))
            .or_else(|| runs.iter().find(|r| r.id.starts_with("term:") && is_active(r)))
            .or_else(|| runs.iter().find(|r| !r.id.starts_with("term:") && is_connected(r)))
            .or_else(|| runs.iter().find(|r| is_connected(r)))
            .cloned()
    };
    let Some(run) = chosen else {
        return Ok(Snapshot {
            runs,
            selected_run: None,
            coordinator: None,
            workers: vec![],
        });
    };
    let terminal = terminals
        .iter()
        .find(|t| text(t, "handle") == Some(&run.coordinator_handle));
    let coordinator_pane = terminal.and_then(pane_key);
    let activity = coordinator_pane
        .as_deref()
        .and_then(|key| project_activity(&activity_rows, key, now));
    let coordinator = Coordinator {
        handle: run.coordinator_handle.clone(),
        cwd: terminal
            .and_then(|t| text(t, "worktreePath"))
            .map(str::to_string),
        connected: terminal.is_some_and(|t| t["connected"] == true),
        provider: terminal
            .and_then(|t| text(t, "agentIdentity"))
            .map(normalize_provider),
        pane_key: coordinator_pane,
        activity,
    };
    let mut workers = if run.id.starts_with("term:") {
        Vec::new()
    } else {
        let task_inventory =
            query(&["orchestration", "task-list", "--run", &run.id, "--brief"]).ok();
        let names: HashMap<String, String> = task_inventory
            .as_ref()
            .and_then(|inv| inv["tasks"].as_array())
            .map(|tasks| {
                tasks
                    .iter()
                    .filter_map(|t| {
                        Some((
                            text(t, "id")?.into(),
                            text(t, "display_name")
                                .or_else(|| text(t, "task_title"))
                                .unwrap_or("Worker")
                                .into(),
                        ))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut rows = Vec::new();
        let mut cursor: Option<String> = None;
        let mut cursors = std::collections::HashSet::new();
        loop {
            let mut args = vec![
                "orchestration",
                "worker-list",
                "--run",
                &run.id,
                "--limit",
                "100",
            ];
            if let Some(ref value) = cursor {
                args.extend(["--cursor", value]);
            }
            let page = query(&args)?;
            if text(&page["scope"], "run") != Some(&run.id) {
                return Err("Orca returned a different Run binding".into());
            }
            rows.extend(
                page["workers"]
                    .as_array()
                    .ok_or("Orca worker inventory is unavailable")?
                    .iter()
                    .cloned(),
            );
            if page["page"]["hasMore"] != true {
                break;
            }
            let next = text(&page["page"], "nextCursor")
                .ok_or("Orca pagination is incomplete")?
                .to_string();
            if rows.len() > 2000 || !cursors.insert(next.clone()) {
                return Err("Orca worker inventory exceeds the telemetry limit".into());
            }
            cursor = Some(next);
        }
        let mut list = project_workers(&rows, &run.id, &names, terminals);
        if let Some(tasks) = task_inventory.as_ref().and_then(|inv| inv["tasks"].as_array()) {
            for t in tasks {
                let Some(task_id) = text(t, "id") else { continue };
                let status = text(t, "status").unwrap_or("");
                if !matches!(status, "dispatched" | "running" | "in_progress") {
                    continue;
                }
                if list.iter().any(|w| w.task_id == task_id) {
                    continue;
                }
                let dispatch_id = text(t, "dispatch_id").unwrap_or(task_id);
                let handle = text(t, "assignee_handle").unwrap_or("");
                let terminal = terminals
                    .iter()
                    .find(|term| text(term, "handle") == Some(handle));
                let name = text(t, "display_name")
                    .or_else(|| text(t, "task_title"))
                    .unwrap_or("Worker");
                let provider = terminal
                    .and_then(|term| text(term, "agentIdentity"))
                    .map(normalize_provider);
                list.push(Worker {
                    id: dispatch_id.to_string(),
                    task_id: task_id.to_string(),
                    name: name.to_string(),
                    state: "working".into(),
                    cwd: terminal
                        .and_then(|term| text(term, "worktreePath"))
                        .map(str::to_string),
                    terminal_handle: handle.to_string(),
                    pane_key: terminal.and_then(pane_key),
                    provider,
                    settled: false,
                    activity: None,
                });
            }
        }
        list
    };
    for worker in &mut workers {
        if let Some(ref key) = worker.pane_key {
            worker.activity = project_activity(&activity_rows, key, now);
        }
    }
    // Never list a worker terminal of the active Run as a standalone Run option.
    runs.retain(|r| {
        !r.id.starts_with("term:")
            || !workers.iter().any(|w| w.terminal_handle == r.coordinator_handle)
    });
    Ok(Snapshot {
        runs,
        selected_run: Some(run),
        coordinator: Some(coordinator),
        workers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn root_bootstrap_recovers_prompt_and_full_command_preview() {
        let row = json!({"paneKey":"root", "updatedAt":100000,"mainAgent":{"state":"working","stateStartedAt":100000},"prompt":"Launch the workers", "toolName":"Bash", "toolInput":"cargo test --workspace"});
        let activity =
            serde_json::to_value(project_activity(&[row], "root", 100000).unwrap()).unwrap();
        assert_eq!(activity["prompt"], "Launch the workers");
        assert_eq!(activity["step"], "Bash \u{b7} cargo test --workspace");
    }

    #[test]
    fn antigravity_row_without_main_agent_and_long_working_turn_stay_fresh() {
        // Orca v1.4.227 reports Antigravity state on the root row with mainAgent: null
        let ag_row = json!({
            "paneKey": "ag:pane",
            "agent": "antigravity",
            "state": "working",
            "stateStartedAt": 20000,
            "updatedAt": 100000,
            "mainAgent": null,
            "prompt": "Audit compatibility",
            "toolName": "run_command",
            "toolInput": { "CommandLine": "orca worktree ps" }
        });
        let activity = project_activity(&[ag_row], "ag:pane", 105000).unwrap();
        assert_eq!(activity.state, "working");
        assert_eq!(activity.prompt.as_deref(), Some("Audit compatibility"));
        assert_eq!(
            activity.step.as_deref(),
            Some("run_command \u{b7} orca worktree ps")
        );
    }

    #[test]
    fn principal_activity_uses_its_own_fresh_pane_and_turn() {
        let mut root = json!({"paneKey":"root:pane", "updatedAt":100000, "state":"working", "mainAgent":{"state":"working", "stateStartedAt":100000}, "toolName":"Bash"});
        let child =
            json!({"paneKey":"child:pane", "updatedAt":100000, "mainAgent":{"state":"done"}});
        let rows = [child, root.clone()];
        let activity = project_activity(&rows, "root:pane", 100010).unwrap();
        assert_eq!(activity.state, "working");
        assert_eq!(activity.step.as_deref(), Some("Bash"));
        assert!(project_activity(&rows, "root:pane", 170000).is_none());
        root["mainAgent"]["state"] = json!("done");
        root["state"] = json!("working");
        assert_eq!(
            project_activity(&[root], "root:pane", 100010)
                .unwrap()
                .state,
            "finished"
        );
        assert!(project_activity(&rows, "missing:pane", 100010).is_none());
        let stale_main = json!({"paneKey":"root:pane", "updatedAt":100000, "mainAgent":{"state":"done", "stateStartedAt":1000}});
        assert!(project_activity(&[stale_main], "root:pane", 100010).is_none());
    }

    #[test]
    fn completed_transcript_uses_only_exact_final_assistant_text() {
        let mut result = json!({"source":"transcript", "sourceExact":true, "contentComplete":true, "projection":{"dispatchId":"dispatch_a", "outcome":"succeeded"}, "transcript":{"messages":[{"role":"assistant", "phase":"commentary", "blocks":[{"type":"text", "text":"I will run the tool"}]}, {"role":"tool", "blocks":[{"type":"tool-result", "output":"success"}]}, {"role":"assistant", "phase":"final_answer", "blocks":[{"type":"text", "text":"Completed the requested change.\n\nMore details."}]}]}});
        assert_eq!(
            extract_final_response(&result, "dispatch_a").as_deref(),
            Some("Completed the requested change.\n\nMore details.")
        );
        assert!(extract_final_response(&result, "another_dispatch").is_none());
        result["transcript"]["messages"][2]["phase"] = json!("commentary");
        assert!(extract_final_response(&result, "dispatch_a").is_none());
        result["transcript"]["messages"][2]["phase"] = json!("final_answer");
        result["transcript"]["messages"][2]["blocks"] = json!([{"type":"reasoning", "text":"private reasoning"}, {"type":"tool-call", "name":"Bash"}]);
        assert!(extract_final_response(&result, "dispatch_a").is_none());
        result["source"] = json!("terminal");
        assert!(extract_final_response(&result, "dispatch_a").is_none());
    }

    #[test]
    #[ignore = "Requires the user's running Orca runtime; read-only integration check"]
    fn live_snapshot_keeps_the_selected_coordinator_binding() {
        let initial = snapshot(None).expect("read-only Orca snapshot should succeed");
        let run = initial
            .selected_run
            .expect("a live coordinator should be found");
        let selected =
            snapshot(Some(run.id.clone())).expect("explicit Run snapshot should succeed");
        assert_eq!(selected.selected_run.as_ref().unwrap().id, run.id);
        assert_eq!(
            selected.coordinator.as_ref().unwrap().handle,
            run.coordinator_handle
        );
        println!(
            "Orca snapshot: {} current workers, {} settled records; coordinator connected: {}",
            selected.workers.iter().filter(|w| !w.settled).count(),
            selected.workers.iter().filter(|w| w.settled).count(),
            selected.coordinator.as_ref().unwrap().connected
        );
        assert!(selected.coordinator.as_ref().unwrap().pane_key.is_some());
        println!(
            "Coordinator pane identity verified; fresh activity present: {}",
            selected.coordinator.as_ref().unwrap().activity.is_some()
        );
    }

    #[test]
    #[ignore = "Activates the user's Orca window; explicit UI integration check"]
    fn live_open_from_installed_directory() {
        let previous = std::env::current_dir().unwrap();
        let installed = crate::platform::local_dir();
        std::env::set_current_dir(installed).unwrap();
        let snapshot = snapshot(None).unwrap();
        let handle = snapshot.coordinator.unwrap().handle;
        let outcome = open_terminal(Some(handle), None);
        std::env::set_current_dir(previous).unwrap();
        assert!(outcome.is_ok(), "native Open Orca failed: {outcome:?}");
    }
    fn worker(id: &str) -> Value {
        json!({ "dispatchId": id, "taskId": id, "runId": "run_a", "agentTerminalHandle": "term_worker", "dispatchStatus": "running", "terminalState": "active", "resource": { "ownershipState": "owned" }, "projection": { "role": "worker", "stage": { "worker": "working", "activity": "working" }, "liveness": { "verdict": "live" }, "provider": { "id": "codex" } } })
    }
    #[test]
    fn only_the_selected_run_is_projected_including_known_settlements() {
        let active = worker("dispatch/full:identity");
        let mut other = worker("other");
        other["runId"] = json!("run_b");
        let mut settled = worker("settled");
        settled["dispatchStatus"] = json!("completed");
        let mut takeover = worker("takeover");
        takeover["resource"]["ownershipState"] = json!("user_owned");
        let rows = project_workers(
            &[active, other, settled, takeover],
            "run_a",
            &HashMap::new(),
            &[],
        );
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].id, "dispatch/full:identity");
        assert!(rows[1].settled);
    }
    #[test]
    fn unknown_liveness_never_claims_work_or_completion() {
        let mut row = worker("unknown");
        row["projection"]["liveness"]["verdict"] = json!("unverifiable");
        let rows = project_workers(&[row], "run_a", &HashMap::new(), &[]);
        assert_eq!(rows[0].state, "idle");
    }

    #[test]
    fn foreground_denial_never_reports_orca_opened() {
        assert!(open_activated(None, |_| Ok(json!({})), || false).is_err());
    }

    #[test]
    fn stale_selection_preserves_confirmed_foreground_without_switching_another_task() {
        let mut calls = Vec::new();
        let result = open_activated(
            Some("expired_child"),
            |args| {
                calls.push(args.join(" "));
                Err("terminal unavailable".into())
            },
            || true,
        )
        .unwrap();
        assert!(result.opened && !result.terminal_focused);
        assert_eq!(calls, ["terminal switch --terminal expired_child"]);
    }

    #[test]
    fn opening_orca_selects_the_exact_runtime_terminal() {
        let mut calls = Vec::new();
        let result = open_activated(
            Some("term_exact:identity"),
            |args| {
                calls.push(args.join(" "));
                Ok(json!({}))
            },
            || true,
        )
        .unwrap();
        assert!(result.opened && result.terminal_focused);
        assert_eq!(calls, ["terminal switch --terminal term_exact:identity"]);
    }

    #[test]
    fn failed_open_never_switches_to_another_terminal() {
        let mut calls = 0;
        assert!(open_activated(
            None,
            |_| {
                calls += 1;
                Err("unavailable".into())
            },
            || false
        )
        .is_err());
        assert_eq!(calls, 1);
    }

    #[test]
    fn a_retained_live_dispatch_is_still_a_child() {
        let mut row = worker("current");
        row["dispatchStatus"] = json!("dispatched");
        row["terminalState"] = json!("retained");
        row["resource"]["ownershipState"] = json!("user_owned");
        row["projection"]["stage"]["worker"] = json!("ready");
        row["projection"]["outcome"] = json!("in_progress");
        let rows = project_workers(&[row], "run_a", &HashMap::new(), &[]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "current");
    }

    #[test]
    fn newest_attempt_survives_prior_failure_and_reports_settlement() {
        let mut current = worker("retry");
        current["taskId"] = json!("same_task");
        let mut old = worker("old");
        old["taskId"] = json!("same_task");
        old["dispatchStatus"] = json!("failed");
        let rows = project_workers(
            &[current.clone(), old.clone()],
            "run_a",
            &HashMap::new(),
            &[],
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "retry");
        current["dispatchStatus"] = json!("completed");
        current["projection"]["outcome"] = json!("succeeded");
        let rows = project_workers(&[current, old], "run_a", &HashMap::new(), &[]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].state, "finished");
        assert!(rows[0].settled);
    }

    #[test]
    fn released_settlement_and_outcome_only_failure_are_available_for_grace() {
        let mut released = worker("released");
        released["terminalState"] = json!("released");
        released["dispatchStatus"] = json!("completed");
        let mut failed = worker("failed");
        failed["dispatchStatus"] = json!("dispatched");
        failed["projection"]["outcome"] = json!("failed");
        let rows = project_workers(&[released, failed], "run_a", &HashMap::new(), &[]);
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|w| w.settled));
        assert_eq!(rows[0].state, "finished");
        assert_eq!(rows[1].state, "error");
    }

    #[test]
    fn older_settled_dispatch_first_does_not_suppress_active_retry() {
        let mut old = worker("old");
        old["taskId"] = json!("same_task");
        old["dispatchStatus"] = json!("failed");
        let mut current = worker("retry");
        current["taskId"] = json!("same_task");
        let rows = project_workers(
            &[old, current],
            "run_a",
            &HashMap::new(),
            &[],
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "retry");
        assert!(!rows[0].settled);
    }

    #[test]
    fn antigravity_provider_normalizes_and_extracts_from_terminal() {
        let mut row = worker("antigrav");
        row["projection"]["provider"] = serde_json::Value::Null;
        let terminal = json!({
            "handle": "term_worker",
            "agentIdentity": "antigravity"
        });
        let rows = project_workers(
            &[row],
            "run_a",
            &HashMap::new(),
            &[terminal],
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].provider.as_deref(), Some("antigravity"));
    }

    #[test]
    fn codex_worker_retains_provider_identity_over_model_or_unknown_projection() {
        let mut row_model = worker("worker_luna");
        row_model["projection"]["provider"] = json!({ "id": "gpt-6-luna" });
        let mut row_vendor = worker("worker_openai");
        row_vendor["projection"]["provider"] = json!("openai");
        let terminal_codex = json!({
            "handle": "term_worker",
            "agentIdentity": "codex"
        });
        let rows = project_workers(
            &[row_model, row_vendor],
            "run_a",
            &HashMap::new(),
            &[terminal_codex],
        );
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].provider.as_deref(), Some("codex"));
        assert_eq!(rows[1].provider.as_deref(), Some("codex"));

        let mut row_unknown = worker("worker_unknown");
        row_unknown["agentTerminalHandle"] = json!("term_unmatched");
        row_unknown["projection"]["provider"] = json!({ "id": "gpt-6-luna" });
        let unknown_rows = project_workers(
            &[row_unknown],
            "run_a",
            &HashMap::new(),
            &[],
        );
        assert_eq!(unknown_rows.len(), 1);
        assert_ne!(unknown_rows[0].provider.as_deref(), Some("codex"));
        assert_eq!(unknown_rows[0].provider.as_deref(), Some("gpt-6-luna"));
    }

    #[test]
    #[ignore = "Activates Orca with a deliberately nonexistent tab; no worker dispatch"]
    fn live_expired_terminal_opens_orca_without_changing_tasks() {
        let snapshot = snapshot(None).unwrap();
        let coordinator = snapshot.coordinator.unwrap().handle;
        let result = open_terminal(
            Some("term_coucou_missing_terminal_test".into()),
            Some(coordinator),
        )
        .unwrap();
        assert!(result.opened && !result.terminal_focused);
    }
}
