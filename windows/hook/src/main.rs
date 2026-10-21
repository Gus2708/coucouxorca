//! coucou-hook — the relay Claude Code runs on every hook event.
//!
//! Reads the hook JSON on stdin, adds a little terminal context, and hands it to
//! Coucou over the named pipe `\\.\pipe\coucou-<sid>` (Windows) or the Unix
//! socket `$XDG_RUNTIME_DIR/coucou.sock` (Linux).
//!
//! Hard rule (docs/CLAUDE.md): **never block Claude Code.**
//! * If the pipe does not exist — Coucou is closed — we exit 0 immediately with
//!   nothing on stdout, and the session carries on untouched.
//! * Every step runs under a deadline enforced by the main thread, so a pipe that
//!   accepts the connection and then stops reading cannot wedge the session
//!   either: we abandon the worker and exit.
//! * Only `PermissionRequest` waits for an answer, because approving from the
//!   island is the whole point. No answer means empty stdout, and Claude Code
//!   asks in the terminal exactly as if Coucou were not installed.
//!
//! Usage: `coucou-hook <EventName>` (the name is also read from the JSON).

use std::io::{Read, Write};
use std::sync::mpsc;
use std::time::Duration;

/// Budget for getting a pipe connection. Beyond this Claude Code wins, always.
const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
/// Whole-run budget for an event nobody waits on: connect and write, no more.
const FIRE_AND_FORGET_BUDGET: Duration = Duration::from_secs(2);
/// How long a permission prompt may stay on screen before the terminal takes over.
const DECISION_BUDGET: Duration = Duration::from_secs(110);

/// Fields that are pointless to forward and can be enormous (a whole file read,
/// a full command output). The island never shows them.
const DROPPED_FIELDS: &[&str] = &["tool_response"];
/// Longest string forwarded for any single field; the island truncates to far
/// less than this anyway.
const MAX_FIELD_LEN: usize = 2_000;

#[cfg(windows)]
mod win;
#[cfg(windows)]
use win::connect;

#[cfg(target_os = "linux")]
mod unix;
#[cfg(target_os = "linux")]
use unix::connect;

fn main() {
    let Some((payload, event)) = read_event() else {
        std::process::exit(0)
    };

    let waits_for_answer = event == "PermissionRequest";
    let budget = if waits_for_answer {
        DECISION_BUDGET
    } else {
        FIRE_AND_FORGET_BUDGET
    };

    // The worker owns every blocking call. If it overruns the budget we simply
    // stop listening and exit: the process dying takes the pipe handle with it.
    // (No catch_unwind here — the release profile is panic = "abort", so it would
    // be dead code. `talk` is written to have nothing to panic on instead.)
    let (tx, rx) = mpsc::channel::<Option<String>>();
    std::thread::spawn(move || {
        let _ = tx.send(talk(&payload, waits_for_answer));
    });

    if let Ok(Some(decision)) = rx.recv_timeout(budget) {
        if let Some(json) = decision_json(&decision) {
            let mut out = std::io::stdout();
            let _ = writeln!(out, "{json}");
            let _ = out.flush();
        }
    }
    // Nothing printed: Claude Code asks in the terminal, as if we were not here.
    std::process::exit(0);
}

/// The documented PermissionRequest output. Anything we do not recognise prints
/// nothing at all rather than guessing — silence is the safe answer.
/// See https://code.claude.com/docs/en/hooks
fn decision_json(decision: &str) -> Option<String> {
    let behavior = match decision.trim() {
        // "always" still answers a plain allow; remembering it is the island's
        // business, not Claude Code's.
        "allow" | "always" => r#"{"behavior":"allow"}"#.to_string(),
        "deny" => r#"{"behavior":"deny","message":"Denied from Coucou"}"#.to_string(),
        _ => return None,
    };
    Some(format!(
        r#"{{"hookSpecificOutput":{{"hookEventName":"PermissionRequest","decision":{behavior}}}}}"#
    ))
}

/// Reads stdin and returns the payload to forward plus the event name.
fn read_event() -> Option<(String, String)> {
    let mut raw = Vec::new();
    if std::io::stdin().read_to_end(&mut raw).is_err() || raw.is_empty() {
        return None;
    }
    // Some shells hand us a UTF-8 BOM; serde_json would choke on it.
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        raw.drain(..3);
    }

    let mut payload = serde_json::from_slice::<serde_json::Value>(&raw).ok()?;
    let map = payload.as_object_mut()?;

    // Parse argv: "coucou-hook.exe [--agent <name>] [<EventName>]"
    // --agent tags the payload with coucou_agent so the app routes to the right pill.
    let mut agent = String::new();
    let mut arg_event = String::new();
    {
        let mut it = std::env::args().skip(1);
        while let Some(arg) = it.next() {
            if arg == "--agent" {
                agent = it.next().unwrap_or_default();
            } else if arg_event.is_empty() {
                arg_event = arg;
            }
        }
    }

    // An explicit user tag is optional context. Orca Run/Dispatch telemetry
    // owns hierarchy; a folder name or a generic git worktree never proves it.
    if agent.is_empty() {
        agent = std::env::var("COUCOU_AGENT").unwrap_or_default();
    }
    normalize_payload(map, &arg_event, &agent, |key| std::env::var(key).ok());
    if map
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(str::is_empty)
        .unwrap_or(true)
    {
        if let Ok(cwd) = std::env::current_dir() {
            map.insert(
                "cwd".into(),
                serde_json::Value::String(cwd.to_string_lossy().to_string()),
            );
        }
    }
    let event = map
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    for field in DROPPED_FIELDS {
        map.remove(*field);
    }

    // Which terminal the session runs in. Unlike macOS, Coucou here accepts
    // events from every terminal, so this is context only — never a filter.
    for (key, var) in [
        ("term_program", "TERM_PROGRAM"),
        ("wt_session", "WT_SESSION"),
        ("term_session_id", "TERM_SESSION_ID"),
        ("vscode_pid", "VSCODE_PID"),
        ("session_pid", "CLAUDE_CODE_SSE_PORT"),
    ] {
        if !map.contains_key(key) {
            let value = std::env::var(var).unwrap_or_default();
            map.insert(key.into(), serde_json::Value::String(value));
        }
    }
    add_orca_identity(map, |key| std::env::var(key).ok());

    truncate_strings(&mut payload);

    let mut line = payload.to_string();
    line.push('\n');
    Some((line, event))
}

fn normalize_payload(
    map: &mut serde_json::Map<String, serde_json::Value>,
    arg_event: &str,
    agent: &str,
    env: impl Fn(&str) -> Option<String>,
) {
    // Normalize session_id across Claude, Codex, Gemini CLI, and Antigravity
    let session_missing = map
        .get("session_id")
        .and_then(|v| v.as_str())
        .map(str::is_empty)
        .unwrap_or(true);
    if session_missing {
        let session = map
            .get("sessionId")
            .or_else(|| map.get("conversationId"))
            .or_else(|| map.get("conversation_id"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| env("GEMINI_SESSION_ID").filter(|s| !s.is_empty()))
            .or_else(|| env("CLAUDE_SESSION_ID").filter(|s| !s.is_empty()));
        if let Some(id) = session {
            map.insert("session_id".into(), serde_json::Value::String(id));
        }
    }

    // Normalize cwd if missing or empty (e.g. Antigravity/Gemini workspaceRoot or workspacePaths)
    let cwd_missing = map
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(str::is_empty)
        .unwrap_or(true);
    if cwd_missing {
        let from_root = map
            .get("workspaceRoot")
            .or_else(|| map.get("workspace_root"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let from_paths = map
            .get("workspacePaths")
            .or_else(|| map.get("workspace_paths"))
            .and_then(|v| v.as_array())
            .and_then(|paths| paths.first())
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let from_env = env("GEMINI_PROJECT_DIR")
            .filter(|s| !s.is_empty())
            .or_else(|| env("CLAUDE_PROJECT_DIR").filter(|s| !s.is_empty()));
        if let Some(cwd) = from_root.or(from_paths).or(from_env) {
            map.insert("cwd".into(), serde_json::Value::String(cwd));
        }
    }

    // Normalize tool_name and tool_input for nested toolCall objects or alternate field names
    if !map.contains_key("tool_name") {
        let name = map
            .get("toolCall")
            .or_else(|| map.get("tool_call"))
            .and_then(|tc| tc.get("name").or_else(|| tc.get("toolName")))
            .or_else(|| map.get("tool"))
            .or_else(|| map.get("name"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(name) = name {
            map.insert("tool_name".into(), serde_json::Value::String(name));
        }
    }
    if !map.contains_key("tool_input") {
        let input = map
            .get("toolCall")
            .or_else(|| map.get("tool_call"))
            .and_then(|tc| {
                tc.get("args")
                    .or_else(|| tc.get("parameters"))
                    .or_else(|| tc.get("input"))
            })
            .or_else(|| map.get("input"))
            .or_else(|| map.get("args"))
            .cloned();
        if let Some(input) = input {
            map.insert("tool_input".into(), input);
        }
    }

    // Normalize prompt and last_assistant_message across agent schemas
    if !map.contains_key("prompt") {
        if let Some(msg) = map
            .get("statusMessage")
            .or_else(|| map.get("user_prompt"))
            .or_else(|| map.get("query"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            map.insert("prompt".into(), serde_json::Value::String(msg.to_string()));
        }
    }
    if !map.contains_key("last_assistant_message") {
        if let Some(resp) = map
            .get("response")
            .or_else(|| map.get("assistant_message"))
            .or_else(|| map.get("agent_response"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            map.insert(
                "last_assistant_message".into(),
                serde_json::Value::String(resp.to_string()),
            );
        }
    }

    if !agent.trim().is_empty() {
        map.insert(
            "coucou_agent".into(),
            serde_json::Value::String(agent.trim().to_string()),
        );
    }

    let raw_event = map
        .get("hook_event_name")
        .or_else(|| map.get("event"))
        .or_else(|| map.get("hookEventName"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| arg_event.to_string());
    let event = match raw_event
        .to_ascii_lowercase()
        .replace(['_', '-'], "")
        .as_str()
    {
        "sessionstart" | "startup" => "SessionStart".into(),
        "userpromptsubmit" | "preinvocation" | "beforeagent" | "beforemodel" => {
            "UserPromptSubmit".into()
        }
        "postinvocation" => "PostInvocation".into(),
        "pretooluse" | "beforetool" | "beforetoolselection" => "PreToolUse".into(),
        "posttooluse" | "aftertool" | "aftermodel" => "PostToolUse".into(),
        "posttoolusefailure" => "PostToolUseFailure".into(),
        "stop" | "afteragent" => "Stop".into(),
        "stopfailure" => "StopFailure".into(),
        "sessionend" | "exit" | "interrupt" => "SessionEnd".into(),
        "subagentstart" => "SubagentStart".into(),
        "subagentstop" => "SubagentStop".into(),
        "permissionrequest" => "PermissionRequest".into(),
        "notification" => "Notification".into(),
        _ => raw_event,
    };
    map.insert("hook_event_name".into(), serde_json::Value::String(event));
}

fn add_orca_identity(
    map: &mut serde_json::Map<String, serde_json::Value>,
    env: impl Fn(&str) -> Option<String>,
) {
    for (field, key) in [
        ("orca_terminal_handle", "ORCA_TERMINAL_HANDLE"),
        ("orca_pane_key", "ORCA_PANE_KEY"),
    ] {
        if let Some(value) = env(key).filter(|v| !v.trim().is_empty()) {
            map.insert(field.into(), serde_json::Value::String(value));
        }
    }
}

/// Caps every string in the payload. A single Write can carry a whole file.
fn truncate_strings(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(s) => {
            if s.len() > MAX_FIELD_LEN {
                // Cut on a char boundary; a lone byte index can split UTF-8.
                let mut end = MAX_FIELD_LEN;
                while end > 0 && !s.is_char_boundary(end) {
                    end -= 1;
                }
                s.truncate(end);
                s.push('…');
            }
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(truncate_strings),
        serde_json::Value::Object(map) => map.values_mut().for_each(truncate_strings),
        _ => {}
    }
}

/// Connect, send, and — for a permission request — wait for the island's word.
fn talk(payload: &str, waits_for_answer: bool) -> Option<String> {
    let mut pipe = connect()?;

    if pipe.write_all(payload.as_bytes()).is_err() {
        return None;
    }
    let _ = pipe.flush();

    if !waits_for_answer {
        return None;
    }

    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    loop {
        match pipe.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.contains(&b'\n') {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    let answer = String::from_utf8_lossy(&buf).trim().to_string();
    (!answer.is_empty()).then_some(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_orca_identity_survives_relay_without_launch_secrets() {
        let mut map = serde_json::Map::new();
        add_orca_identity(&mut map, |key| match key {
            "ORCA_TERMINAL_HANDLE" => Some("term_root".into()),
            "ORCA_PANE_KEY" => Some("tab_root:leaf_root".into()),
            _ => panic!("unnecessary environment read"),
        });
        assert_eq!(map["orca_terminal_handle"], "term_root");
        assert_eq!(map["orca_pane_key"], "tab_root:leaf_root");
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn normalizes_gemini_and_antigravity_hook_events_and_nested_tool_calls() {
        let mut v = serde_json::json!({
            "conversationId": "conv-123",
            "workspacePaths": ["C:/repo/coucou"],
            "toolCall": {
                "toolName": "run_command",
                "parameters": { "CommandLine": "cargo test" }
            }
        });
        let map = v.as_object_mut().unwrap();
        normalize_payload(map, "BeforeTool", "antigravity", |_| None);
        assert_eq!(map["hook_event_name"], "PreToolUse");
        assert_eq!(map["session_id"], "conv-123");
        assert_eq!(map["cwd"], "C:/repo/coucou");
        assert_eq!(map["tool_name"], "run_command");
        assert_eq!(map["tool_input"]["CommandLine"], "cargo test");
        assert_eq!(map["coucou_agent"], "antigravity");

        let mut stop = serde_json::json!({
            "hookEventName": "AfterAgent",
            "response": "All tasks completed."
        });
        let stop_map = stop.as_object_mut().unwrap();
        normalize_payload(stop_map, "", "", |k| {
            (k == "GEMINI_SESSION_ID").then(|| "gem-sess".into())
        });
        assert_eq!(stop_map["hook_event_name"], "Stop");
        assert_eq!(stop_map["session_id"], "gem-sess");
        assert_eq!(stop_map["last_assistant_message"], "All tasks completed.");
    }

    #[test]
    fn decision_json_matches_the_documented_shape() {
        assert_eq!(
            decision_json("allow").unwrap(),
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}"#
        );
        assert_eq!(
            decision_json("deny").unwrap(),
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied from Coucou"}}}"#
        );
        // "always" is an island concept; Claude Code just gets an allow.
        assert!(decision_json("always")
            .unwrap()
            .contains(r#""behavior":"allow""#));
    }

    #[test]
    fn anything_unrecognised_prints_nothing() {
        assert!(decision_json("").is_none());
        assert!(decision_json("maybe").is_none());
        // The shape the app used to send must not be mistaken for a decision.
        assert!(decision_json(r#"{"permissionDecision":"allow"}"#).is_none());
    }

    #[test]
    fn long_strings_are_cut_on_a_char_boundary() {
        let mut v = serde_json::json!({ "tool_input": { "content": "é".repeat(4000) } });
        truncate_strings(&mut v);
        let s = v["tool_input"]["content"].as_str().unwrap();
        assert!(s.len() <= MAX_FIELD_LEN + 4);
        assert!(s.ends_with('…'));
    }
}
