//! Read only assistant prose from an exact hook-reported Codex rollout.
use serde::Serialize;
use serde_json::Value;
#[derive(Debug, Serialize)]
pub struct Message {
    pub text: String,
    pub phase: String,
}
fn parse_message(records: &[Value], session: &str, turn: &str) -> Option<Message> {
    if records.first()?["type"] != "session_meta" || records.first()?["payload"]["id"] != session {
        return None;
    }
    let mut current_turn = None;
    let mut latest = None;
    for record in records.iter().skip(1) {
        let payload = &record["payload"];
        if record["type"] == "event_msg"
            && matches!(
                payload["type"].as_str(),
                Some("task_started" | "turn_started")
            )
        {
            current_turn = payload["turn_id"].as_str();
            latest = None;
        }
        if current_turn != Some(turn) {
            continue;
        }
        if record["type"] != "response_item"
            || payload["type"] != "message"
            || payload["role"] != "assistant"
        {
            continue;
        }
        let Some(phase) = payload["phase"].as_str() else {
            continue;
        };
        if !matches!(phase, "commentary" | "final_answer") {
            continue;
        }
        let Some(content) = payload["content"].as_array() else {
            continue;
        };
        if content.iter().any(|block| block["type"] != "output_text") {
            continue;
        }
        let text = content
            .iter()
            .filter_map(|block| block["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        if !text.trim().is_empty() {
            latest = Some(Message {
                text: text.chars().take(12000).collect(),
                phase: phase.into(),
            });
        }
    }
    latest
}

/// Header validates session identity; bounded tail must contain the exact turn start.
pub fn read_message(
    path: String,
    session: String,
    turn: String,
) -> Result<Option<Message>, String> {
    use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
    let path = std::path::Path::new(&path);
    if !path.is_absolute()
        || path.extension().and_then(|s| s.to_str()) != Some("jsonl")
        || session.is_empty()
        || turn.is_empty()
    {
        return Ok(None);
    }
    let file =
        std::fs::File::open(path).map_err(|_| "Codex response is unavailable".to_string())?;
    let length = file
        .metadata()
        .map_err(|_| "Codex response is unavailable".to_string())?
        .len();
    let mut reader = BufReader::new(file);
    let mut header = Vec::new();
    reader
        .by_ref()
        .take(65536)
        .read_until(b'\n', &mut header)
        .map_err(|_| "Codex response is unavailable".to_string())?;
    let Ok(meta) = serde_json::from_slice::<Value>(&header) else {
        return Ok(None);
    };
    if meta["type"] != "session_meta" || meta["payload"]["id"] != session {
        return Ok(None);
    }
    const LIMIT: u64 = 8 * 1024 * 1024;
    let start = length.saturating_sub(LIMIT).max(header.len() as u64);
    reader
        .seek(SeekFrom::Start(start))
        .map_err(|_| "Codex response is unavailable".to_string())?;
    let mut bytes = Vec::new();
    reader
        .take(LIMIT)
        .read_to_end(&mut bytes)
        .map_err(|_| "Codex response is unavailable".to_string())?;
    let mut lines = bytes.split(|b| *b == b'\n');
    if start > header.len() as u64 {
        let _ = lines.next();
    }
    let mut records = vec![meta];
    // Never parse a partial trailing record or retain huge tool-output objects.
    for line in lines {
        if line.len() <= 512 * 1024 {
            if let Ok(record) = serde_json::from_slice::<Value>(line) {
                records.push(record);
            }
        }
    }
    Ok(parse_message(&records, &session, &turn))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Child {
    pub id: String,
    pub name: String,
    pub state: String,
    pub text: Option<String>,
    pub phase: Option<String>,
    pub turn: Option<String>,
}

fn project_child(rows: &[Value], parent: &str, id: &str, name: &str) -> Option<Child> {
    let meta = &rows.first()?["payload"];
    if meta["id"] != id || meta["source"]["subagent"]["thread_spawn"]["parent_thread_id"] != parent
    {
        return None;
    }
    let mut turn = None;
    let mut state = "idle";
    for row in rows.iter().skip(1) {
        if row["type"] != "event_msg" {
            continue;
        }
        let payload = &row["payload"];
        match payload["type"].as_str() {
            Some("task_started" | "turn_started") => {
                turn = payload["turn_id"].as_str();
                state = "working";
            }
            Some("task_complete" | "turn_complete") if turn.is_some() => state = "finished",
            Some("turn_aborted") if turn.is_some() => state = "error",
            _ => {}
        }
    }
    let turn = turn?;
    let message = parse_message(rows, id, turn);
    Some(Child {
        id: id.into(),
        name: name.chars().take(80).collect(),
        state: state.into(),
        text: message.as_ref().map(|m| m.text.clone()),
        phase: message.map(|m| m.phase),
        turn: Some(turn.into()),
    })
}

fn bounded_rows(path: &std::path::Path) -> Option<Vec<Value>> {
    use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
    let file = std::fs::File::open(path).ok()?;
    let length = file.metadata().ok()?.len();
    let mut reader = BufReader::new(file);
    let mut header = Vec::new();
    reader
        .by_ref()
        .take(65536)
        .read_until(b'\n', &mut header)
        .ok()?;
    let meta: Value = serde_json::from_slice(&header).ok()?;
    const LIMIT: u64 = 8 * 1024 * 1024;
    let start = length.saturating_sub(LIMIT).max(header.len() as u64);
    reader.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    reader.take(LIMIT).read_to_end(&mut bytes).ok()?;
    let mut lines = bytes.split(|b| *b == b'\n');
    if start > header.len() as u64 {
        lines.next();
    }
    let mut rows = vec![meta];
    rows.extend(
        lines
            .filter(|line| line.len() <= 512 * 1024)
            .filter_map(|line| serde_json::from_slice::<Value>(line).ok()),
    );
    Some(rows)
}

/// Resolve only IDs declared by the exact parent rollout through Codex's read-only registry.
pub fn read_children(path: String, session: String) -> Vec<Child> {
    let path = std::path::Path::new(&path);
    let Some(rows) = bounded_rows(path) else {
        return vec![];
    };
    if rows.first().map(|r| &r["payload"]["id"]) != Some(&Value::String(session.clone())) {
        return vec![];
    }
    let Some(home) = path
        .ancestors()
        .find(|p| p.file_name().and_then(|s| s.to_str()) == Some("sessions"))
        .and_then(|p| p.parent())
    else {
        return vec![];
    };
    let Ok(db) = rusqlite::Connection::open_with_flags(
        home.join("state_5.sqlite"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return vec![];
    };
    let Ok(parent_path) = db.query_row(
        "SELECT rollout_path FROM threads WHERE id=?1",
        [&session],
        |r| r.get::<_, String>(0),
    ) else {
        return vec![];
    };
    if std::fs::canonicalize(parent_path).ok() != std::fs::canonicalize(path).ok() {
        return vec![];
    }
    let mut declarations = std::collections::BTreeMap::new();
    // The registry's published thread_spawn source is itself an exact parent declaration.
    if let Ok(mut statement) = db.prepare("SELECT id, source FROM threads WHERE json_valid(source) AND json_extract(source,'$.subagent.thread_spawn.parent_thread_id')=?1 ORDER BY updated_at DESC LIMIT 32") {
        if let Ok(found) = statement.query_map([&session], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))) {
            for row in found.flatten() {
                if let Ok(source)=serde_json::from_str::<Value>(&row.1) {
                    let spawn=&source["subagent"]["thread_spawn"];
                    if spawn["parent_thread_id"] == session {
                        declarations.insert(row.0,spawn["agent_path"].as_str().unwrap_or("Codex agent").to_string());
                    }
                }
            }
        }
    }

    for row in &rows {
        let p = &row["payload"];
        if row["type"] != "event_msg" || p["type"] != "sub_agent_activity" {
            continue;
        }
        let Some(id) = p["agent_thread_id"].as_str().filter(|s| {
            !s.is_empty()
                && s.len() <= 64
                && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        }) else {
            continue;
        };
        match p["kind"].as_str() {
            Some("started" | "interacted") => {
                declarations.insert(
                    id.to_string(),
                    p["agent_path"]
                        .as_str()
                        .unwrap_or("Codex agent")
                        .to_string(),
                );
            }
            Some("interrupted") => {
                declarations.remove(id);
            }
            _ => {}
        }
    }
    declarations
        .into_iter()
        .take(32)
        .filter_map(|(id, name)| {
            let child_path = db
                .query_row("SELECT rollout_path FROM threads WHERE id=?1", [&id], |r| {
                    r.get::<_, String>(0)
                })
                .ok()?;
            let child = bounded_rows(std::path::Path::new(&child_path))?;
            project_child(&child, &session, &id, &name)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn records() -> Vec<Value> {
        vec![
            json!({"type":"session_meta","payload":{"id":"root_session"}}),
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"turn_current"}}),
            json!({"type":"response_item","payload":{"type":"message","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"Tests are running in the background."}]}}),
            json!({"type":"response_item","payload":{"type":"function_call","arguments":"private tool input"}}),
            json!({"type":"response_item","payload":{"type":"reasoning","summary":[{"text":"private reasoning"}]}}),
        ]
    }
    #[test]
    fn live_prose_excludes_tools_and_reasoning_and_rejects_wrong_identity() {
        let rows = records();
        assert_eq!(
            parse_message(&rows, "root_session", "turn_current")
                .unwrap()
                .text,
            "Tests are running in the background."
        );
        assert!(parse_message(&rows, "child_session", "turn_current").is_none());
        assert!(parse_message(&rows, "root_session", "old_turn").is_none());
    }
    #[test]
    fn exact_rollout_file_rejects_foreign_session_and_returns_live_prose() {
        let path = std::env::temp_dir().join(format!("coucou-codex-{}.jsonl", std::process::id()));
        let text = records()
            .iter()
            .map(|r| serde_json::to_string(r).unwrap())
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        std::fs::write(&path, text).unwrap();
        let actual = read_message(
            path.to_string_lossy().into(),
            "root_session".into(),
            "turn_current".into(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(actual.phase, "commentary");
        assert!(read_message(
            path.to_string_lossy().into(),
            "foreign_session".into(),
            "turn_current".into()
        )
        .unwrap()
        .is_none());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn later_turn_invalidates_old_commentary() {
        let mut rows = records();
        rows.push(
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"next_turn"}}),
        );
        assert!(parse_message(&rows, "root_session", "turn_current").is_none());
    }
    #[test]
    fn native_child_requires_exact_parent_and_own_turn_excludes_fork_history() {
        let mut rows = records();
        rows[0] = json!({"type":"session_meta","payload":{"id":"child","source":{"subagent":{"thread_spawn":{"parent_thread_id":"root"}}}}});
        assert!(project_child(&rows, "root", "child", "Worker").is_some());
        assert!(project_child(&rows, "foreign", "child", "Worker").is_none());
        rows.truncate(1);
        rows.push(json!({"type":"response_item","payload":{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"Inherited parent result"}]}}));
        assert!(project_child(&rows, "root", "child", "Worker").is_none());
        rows.push(json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"own"}}));
        assert_eq!(
            project_child(&rows, "root", "child", "Worker")
                .unwrap()
                .state,
            "working"
        );
        rows.push(json!({"type":"event_msg","payload":{"type":"task_complete","turn_id":"own"}}));
        let child = project_child(&rows, "root", "child", "Worker").unwrap();
        assert_eq!(child.state, "finished");
        assert!(child.text.is_none());
    }

    #[test]
    fn registry_resolves_declared_child_only_and_validates_parent_rollout() {
        let home = std::env::temp_dir().join(format!("coucou-registry-{}", std::process::id()));
        let sessions = home.join("sessions/2026/10/08");
        std::fs::create_dir_all(&sessions).unwrap();
        let root = sessions.join("root.jsonl");
        let child = sessions.join("child.jsonl");
        let write = |path: &std::path::Path, rows: Vec<Value>| {
            std::fs::write(
                path,
                rows.iter()
                    .map(|r| r.to_string() + "\n")
                    .collect::<String>(),
            )
            .unwrap()
        };
        write(
            &root,
            vec![
                json!({"type":"session_meta","payload":{"id":"root"}}),
                json!({"type":"event_msg","payload":{"type":"sub_agent_activity","kind":"started","agent_thread_id":"child","agent_path":"/root/visual"}}),
            ],
        );
        write(
            &child,
            vec![
                json!({"type":"session_meta","payload":{"id":"child","source":{"subagent":{"thread_spawn":{"parent_thread_id":"root"}}}}}),
                json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"own"}}),
            ],
        );
        let db = rusqlite::Connection::open(home.join("state_5.sqlite")).unwrap();
        db.execute(
            "CREATE TABLE threads(id TEXT, rollout_path TEXT, source TEXT, updated_at INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO threads(id,rollout_path) VALUES (?1,?2)",
            rusqlite::params!["root", root.to_string_lossy()],
        )
        .unwrap();
        db.execute(
            "INSERT INTO threads(id,rollout_path) VALUES (?1,?2)",
            rusqlite::params!["child", child.to_string_lossy()],
        )
        .unwrap();
        assert_eq!(
            read_children(root.to_string_lossy().into(), "root".into()).len(),
            1
        );
        db.execute("UPDATE threads SET source=?1 WHERE id='child'",[json!({"subagent":{"thread_spawn":{"parent_thread_id":"root","agent_path":"/root/visual"}}}).to_string()]).unwrap();
        write(
            &root,
            vec![json!({"type":"session_meta","payload":{"id":"root"}})],
        );
        assert_eq!(
            read_children(root.to_string_lossy().into(), "root".into()).len(),
            1,
            "registry parent declaration works without copied activity events"
        );

        assert!(read_children(root.to_string_lossy().into(), "foreign".into()).is_empty());
        db.execute(
            "UPDATE threads SET rollout_path=?1 WHERE id='root'",
            [child.to_string_lossy()],
        )
        .unwrap();
        assert!(read_children(root.to_string_lossy().into(), "root".into()).is_empty());
        drop(db);
        std::fs::remove_dir_all(home).unwrap();
    }
}
