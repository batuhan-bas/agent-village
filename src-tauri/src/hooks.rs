//! Connects Claude Code and Codex to the village by adding our hooks to their settings files
//! (and takes them out again). The hook lists are the example files in hooks/, so the app and
//! the README never disagree. A hook is ours when it mentions our address.

use serde_json::{Map, Value, json};
use std::{fs, io::ErrorKind, path::PathBuf};

const ADDRESS: &str = "127.0.0.1:4343/event";
const CLAUDE: &str = include_str!("../../hooks/claude-settings.example.json");
const CODEX: &str = include_str!("../../hooks/codex-hooks.example.json");

fn ours(v: &Value) -> bool {
    v.to_string().contains(ADDRESS)
}

/// (the client's folder, its hook file, our hooks for it)
fn client(name: &str) -> Result<(PathBuf, PathBuf, &'static str), String> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).ok_or("no home folder")?;
    match name {
        "claude" => Ok((home.join(".claude"), home.join(".claude").join("settings.json"), CLAUDE)),
        "codex" => Ok((home.join(".codex"), home.join(".codex").join("hooks.json"), CODEX)),
        _ => Err(format!("unknown client {name}")),
    }
}

fn read(path: &PathBuf) -> Result<Value, String> {
    match fs::read_to_string(path) {
        Ok(s) if s.trim().is_empty() => Ok(json!({})),
        Ok(s) => serde_json::from_str(&s).map_err(|e| format!("{} is not valid JSON ({e}), so it was left alone", path.display())),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(format!("cannot read {}: {e}", path.display())),
    }
}

/// Keeps a copy of the file as it was, then replaces it in one step.
fn write(path: &PathBuf, v: &Value) -> Result<(), String> {
    let err = |e: std::io::Error| format!("cannot write {}: {e}", path.display());
    if path.exists() {
        fs::copy(path, path.with_extension("json.agent-village-backup")).map_err(err)?;
    }
    let tmp = path.with_extension("json.agent-village-tmp");
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())? + "\n";
    fs::write(&tmp, text).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

/// Replaces our hooks with the template's: any we added before (including the older `http`
/// ones) come out first, so connecting again upgrades them without doubling up. Everything
/// else in the settings stays as it was.
pub fn connect(settings: &mut Value, template: &Value) -> Result<(), String> {
    settings.as_object().ok_or("the settings file is not a JSON object")?;
    disconnect(settings);
    let hooks = settings.as_object_mut().unwrap().entry("hooks").or_insert_with(|| json!({})).as_object_mut().ok_or("\"hooks\" is not an object")?;
    for (event, groups) in template["hooks"].as_object().into_iter().flatten() {
        let list = hooks.entry(event.clone()).or_insert_with(|| json!([])).as_array_mut().ok_or(format!("hooks.{event} is not a list"))?;
        list.extend(groups.as_array().into_iter().flatten().cloned());
    }
    Ok(())
}

/// Takes our hooks out, and any event or matcher group left empty by that.
pub fn disconnect(settings: &mut Value) {
    let Some(hooks) = settings.get_mut("hooks").and_then(Value::as_object_mut) else { return };
    for list in hooks.values_mut().filter_map(Value::as_array_mut) {
        list.retain_mut(|group| match group.get_mut("hooks").and_then(Value::as_array_mut) {
            Some(handlers) => {
                handlers.retain(|h| !ours(h));
                !handlers.is_empty()
            }
            None => !ours(group),
        });
    }
    hooks.retain(|_, list| list.as_array().is_none_or(|l| !l.is_empty()));
    if hooks.is_empty() {
        settings.as_object_mut().map(|o| o.remove("hooks"));
    }
}

/// For each client: whether it is installed (its folder exists) and whether it is connected.
#[tauri::command]
pub fn hook_status() -> Value {
    let mut out = Map::new();
    for name in ["claude", "codex"] {
        if let Ok((dir, file, _)) = client(name) {
            let connected = read(&file).map(|v| v.get("hooks").is_some_and(ours)).unwrap_or(false);
            out.insert(name.into(), json!({ "installed": dir.is_dir(), "connected": connected }));
        }
    }
    Value::Object(out)
}

#[tauri::command]
pub fn set_hooks(client_name: String, on: bool) -> Result<(), String> {
    let (dir, file, template) = client(&client_name)?;
    if !dir.is_dir() {
        return Err(format!("{} is not installed", client_name));
    }
    let mut settings = read(&file)?;
    if on {
        connect(&mut settings, &serde_json::from_str(template).map_err(|e| e.to_string())?)?;
    } else {
        disconnect(&mut settings);
    }
    write(&file, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connect_is_idempotent_and_disconnect_restores_the_file() {
        let original = json!({
            "model": "opus",
            "hooks": {
                "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "lint.sh" }] }],
                "Notification": [{ "hooks": [{ "type": "command", "command": "say hi" }] }]
            }
        });
        let template: Value = serde_json::from_str(CLAUDE).unwrap();
        let mut s = original.clone();
        connect(&mut s, &template).unwrap();
        let once = s.clone();
        connect(&mut s, &template).unwrap();
        assert_eq!(s, once, "connecting twice must not add the hooks twice");
        for event in ["PreToolUse", "SessionEnd", "Stop", "SubagentStop"] {
            assert!(ours(&s["hooks"][event]), "{event} not connected");
        }
        assert_eq!(s["hooks"]["PreToolUse"][0]["hooks"][0]["command"], "lint.sh", "the user's own hook must stay");
        disconnect(&mut s);
        assert_eq!(s, original);
    }

    #[test]
    fn disconnect_on_an_empty_file_leaves_it_empty_and_codex_template_connects() {
        let mut s = json!({});
        connect(&mut s, &serde_json::from_str(CODEX).unwrap()).unwrap();
        assert!(ours(&s["hooks"]["SessionEnd"]));
        disconnect(&mut s);
        assert_eq!(s, json!({}));
    }

    #[test]
    fn set_hooks_writes_the_real_file_and_keeps_a_backup() {
        let home = std::env::temp_dir().join(format!("agent-village-test-{}", std::process::id()));
        let dir = home.join(".claude");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("settings.json");
        fs::write(&file, r#"{"theme":"dark","hooks":{"Stop":[{"hooks":[{"type":"command","command":"say done"}]}]}}"#).unwrap();
        unsafe { std::env::set_var("HOME", &home) }; // only this test reads HOME
        assert_eq!(hook_status()["claude"], json!({ "installed": true, "connected": false }));
        set_hooks("claude".into(), true).unwrap();
        assert_eq!(hook_status()["claude"]["connected"], true);
        assert!(dir.join("settings.json.agent-village-backup").exists());
        set_hooks("claude".into(), false).unwrap();
        let back: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(back, json!({"theme":"dark","hooks":{"Stop":[{"hooks":[{"type":"command","command":"say done"}]}]}}));
        fs::write(&file, "{ not json").unwrap();
        assert!(set_hooks("claude".into(), true).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "{ not json", "a broken file must be left alone");
        fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn connect_replaces_the_old_http_hooks() {
        let http = json!({ "type": "http", "url": "http://127.0.0.1:4343/event", "timeout": 1 });
        let mine = json!({ "type": "command", "command": "lint.sh" });
        let mut s = json!({ "hooks": {
            "PreToolUse": [{ "matcher": "Bash", "hooks": [mine.clone()] }, { "matcher": "*", "hooks": [http.clone()] }],
            "Stop": [{ "hooks": [http.clone()] }]
        } });
        connect(&mut s, &serde_json::from_str(CLAUDE).unwrap()).unwrap();
        assert!(!s.to_string().contains("\"http\""), "the old http hooks must be gone");
        for (event, list) in s["hooks"].as_object().unwrap() {
            let handlers: Vec<&Value> = list.as_array().unwrap().iter().flat_map(|g| g["hooks"].as_array().unwrap()).filter(|h| ours(h)).collect();
            assert_eq!(handlers.len(), 1, "{event}: exactly one hook of ours");
            assert_eq!(handlers[0]["type"], "command", "{event}");
        }
        assert_eq!(s["hooks"]["PreToolUse"][0]["hooks"][0], mine, "the user's own hook must stay first");
    }

    #[test]
    fn claude_hooks_never_fail_or_print() {
        let template: Value = serde_json::from_str(CLAUDE).unwrap();
        for (event, list) in template["hooks"].as_object().unwrap() {
            let h = &list[0]["hooks"][0];
            assert_eq!(h["type"], "command", "{event}");
            let cmd = h["command"].as_str().unwrap();
            assert!(cmd.contains("-s ") && cmd.contains("-o /dev/null") && cmd.ends_with("|| true"), "{event}: {cmd}");
            assert!(event == "SessionEnd" || h["async"] == true, "{event} must run in the background");
        }
    }

    #[test]
    fn refuses_settings_that_are_not_an_object() {
        assert!(connect(&mut json!([]), &serde_json::from_str(CLAUDE).unwrap()).is_err());
    }
}
