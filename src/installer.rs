use std::path::PathBuf;
use std::fs;
use semver::Version;
use crate::ui;

pub fn get_qtex_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".qtex")
}

pub fn get_versions_dir() -> PathBuf {
    get_qtex_dir().join("versions")
}

pub fn setup_installation(version: &str) -> std::io::Result<PathBuf> {
    let qtex_dir = get_qtex_dir();
    
    // Check for legacy non-rust installation (usually has a 'runtime' folder or JS files)
    let legacy_paths = [
        qtex_dir.join("runtime"),
        qtex_dir.join("package.json"),
        qtex_dir.join("index.js"),
    ];

    for path in &legacy_paths {
        if path.exists() {
            ui::warn("Detected legacy non-Rust installation. Cleaning up for a fresh start...");
            let _ = fs::remove_dir_all(&qtex_dir);
            break;
        }
    }

    let versions_dir = get_versions_dir();
    
    if !versions_dir.exists() {
        fs::create_dir_all(&versions_dir)?;
    }

    let current_version_dir = versions_dir.join(version);
    if !current_version_dir.exists() {
        fs::create_dir_all(&current_version_dir)?;
    }

    Ok(current_version_dir)
}

pub fn cleanup_old_versions(current_version: &str) -> std::io::Result<()> {
    let versions_dir = get_versions_dir();
    if !versions_dir.exists() {
        return Ok(());
    }

    let current_v = Version::parse(current_version).ok();

    for entry in fs::read_dir(versions_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let version_str = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if let Ok(v) = Version::parse(version_str) {
                if let Some(ref curr) = current_v {
                    if &v < curr {
                        ui::info(&format!("Cleaning up old version: {}", version_str));
                        fs::remove_dir_all(path)?;
                    }
                } else if version_str != current_version {
                    // Fallback for non-semver or if current fails
                    ui::info(&format!("Cleaning up unknown version folder: {}", version_str));
                    fs::remove_dir_all(path)?;
                }
            }
        }
    }
    Ok(())
}

pub async fn self_update() -> Result<(), Box<dyn std::error::Error>> {
    let current_version = env!("CARGO_PKG_VERSION");
    ui::info(&format!("Checking for updates... (Current: v{})", current_version));

    let client = reqwest::Client::builder()
        .user_agent("qtex-cli")
        .build()?;

    let release: serde_json::Value = client
        .get("https://api.github.com/repos/srsergiolazaro/qtex/releases/latest")
        .send()
        .await?
        .json()
        .await?;

    let latest_version = release["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
    
    if latest_version.is_empty() {
        ui::error("Could not determine latest version from GitHub.");
        return Ok(());
    }

    if latest_version == current_version {
        ui::info("You are already on the latest version.");
        return Ok(());
    }

    ui::info(&format!("New version available: v{}", latest_version));
    
    // Determine asset name based on platform
    let asset_name = if cfg!(target_os = "windows") {
        "qtex-windows-x64.exe"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "qtex-darwin-arm64" } else { "qtex-darwin-x64" }
    } else {
        if cfg!(target_env = "musl") { "qtex-linux-x64-musl" } else { "qtex-linux-x64" }
    };

    let asset = release["assets"]
        .as_array()
        .and_then(|assets| {
            assets.iter().find(|a| a["name"].as_str() == Some(asset_name))
        });

    if let Some(asset) = asset {
        let download_url = asset["browser_download_url"].as_str().unwrap_or("");
        ui::info(&format!("Downloading {}...", asset_name));
        
        let response = client.get(download_url).send().await?;
        let bytes = response.bytes().await?;

        let qtex_dir = get_qtex_dir();
        let bin_dir = qtex_dir.join("bin");
        let binary_path = bin_dir.join(if cfg!(target_os = "windows") { "qtex.exe" } else { "qtex" });

        // Ensure bin directory exists
        fs::create_dir_all(&bin_dir)?;

        // Write new binary
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::write(&binary_path, &bytes)?;
            let mut perms = fs::metadata(&binary_path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&binary_path, perms)?;
        }
        #[cfg(not(unix))]
        {
            fs::write(&binary_path, &bytes)?;
        }

        ui::info(&format!("Successfully updated to v{}!", latest_version));
    } else {
        ui::error(&format!("Could not find binary for {} in the latest release.", asset_name));
    }

    Ok(())
}
