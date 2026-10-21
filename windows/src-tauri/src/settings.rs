// Preferences, stored as plain JSON in settings.json under platform::config_dir().
// No secret ever lands here — API keys live in the OS keychain (see secrets.rs).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub orca_skin: bool,
    #[serde(default)]
    pub principal_skin: Option<String>,
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub auto_close_interval: f64,
    pub absence_interval: f64,
    pub active_integrations: Vec<String>,
    /// "primary" = the main display, "cursor" = whichever display the mouse is on.
    pub screen: String,
    pub autostart: bool,
    pub hooks_installed: bool,
    /// Claude model used by the chat. Changeable in the settings window.
    /// Defaulted explicitly so a settings.json written by an older build still loads.
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_workspace_name")]
    pub workspace_name: String,
    #[serde(default = "default_workspace_color")]
    pub workspace_color: String,
}

fn default_model() -> String {
    crate::claude::DEFAULT_MODEL.to_string()
}

fn default_workspace_name() -> String {
    "Orca".to_string()
}

fn default_workspace_color() -> String {
    "#F5F6F8".to_string()
}

impl Settings {
    pub fn resolved_skin(&self) -> &str {
        match self.principal_skin.as_deref() {
            Some(s @ ("classic" | "orca" | "antigravity" | "codex" | "claude")) => s,
            _ if self.orca_skin => "orca",
            _ => "classic",
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            orca_skin: false,
            principal_skin: None,
            sound_enabled: true,
            sound_volume: 0.12,
            auto_close_interval: 15.0,
            absence_interval: 180.0,
            active_integrations: vec![
                "integration_resend".into(),
                "integration_n8n".into(),
                "integration_vercel".into(),
                "integration_github".into(),
            ],
            screen: "primary".into(),
            autostart: false,
            hooks_installed: false,
            model: default_model(),
            workspace_name: default_workspace_name(),
            workspace_color: default_workspace_color(),
        }
    }
}

pub use crate::platform::{config_dir, local_dir};

pub fn hook_exe_path() -> PathBuf {
    local_dir().join("bin").join(crate::platform::HOOK_EXE)
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    let mut settings: Settings = match std::fs::read(settings_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    };
    settings.principal_skin = Some(settings.resolved_skin().to_string());
    settings
}

pub fn save(settings: &Settings) -> std::io::Result<()> {
    let dir = config_dir();
    crate::platform::ensure_private_dir(&dir)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(settings_path(), json)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn principal_skin_migrates_orca_and_preserves_an_independent_explicit_choice() {
        let mut old = serde_json::to_value(Settings::default()).unwrap();
        old.as_object_mut().unwrap().remove("principalSkin");
        old["orcaSkin"] = serde_json::json!(true);
        let migrated: Settings = serde_json::from_value(old.clone()).unwrap();
        assert_eq!(migrated.resolved_skin(), "orca");
        for choice in ["classic", "orca", "antigravity", "codex", "claude"] {
            old["principalSkin"] = serde_json::json!(choice);
            let selected: Settings = serde_json::from_value(old.clone()).unwrap();
            let restarted: Settings =
                serde_json::from_slice(&serde_json::to_vec(&selected).unwrap()).unwrap();
            assert_eq!(restarted.resolved_skin(), choice);
        }
    }
    #[test]
    fn orca_skin_defaults_off_for_existing_settings_and_survives_restart() {
        let mut old = serde_json::to_value(Settings::default()).unwrap();
        old.as_object_mut().unwrap().remove("orcaSkin");
        old["soundVolume"] = serde_json::json!(0.08);
        let loaded: Settings = serde_json::from_value(old.clone()).unwrap();
        let loaded = serde_json::to_value(loaded).unwrap();
        assert_eq!(loaded["orcaSkin"], false);
        assert_eq!(loaded["soundVolume"], 0.08);
        old["orcaSkin"] = serde_json::json!(true);
        let on: Settings = serde_json::from_value(old).unwrap();
        let saved = serde_json::to_vec(&on).unwrap();
        let restarted: Settings = serde_json::from_slice(&saved).unwrap();
        assert_eq!(serde_json::to_value(restarted).unwrap()["orcaSkin"], true);
    }
}
