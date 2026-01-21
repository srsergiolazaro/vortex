use std::path::PathBuf;
use std::fs;
use crate::ui;

fn get_bin_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".qtex").join("bin")
}

pub async fn self_update() -> Result<(), Box<dyn std::error::Error>> {
    let current = env!("CARGO_PKG_VERSION");
    ui::info(&format!("Current version: v{}", current));

    let client = reqwest::Client::builder().user_agent("qtex").build()?;
    
    let release: serde_json::Value = client
        .get("https://api.github.com/repos/srsergiolazaro/qtex/releases/latest")
        .send()
        .await?
        .json()
        .await?;

    let latest = release["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
    
    if latest.is_empty() {
        return Err("Could not fetch latest version".into());
    }

    if latest == current {
        ui::info("Already on latest version");
        return Ok(());
    }

    ui::info(&format!("Updating to v{}...", latest));

    let asset_name = if cfg!(target_os = "windows") {
        "qtex-windows-x64.exe"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "qtex-darwin-arm64" } else { "qtex-darwin-x64" }
    } else {
        "qtex-linux-x64"
    };

    let download_url = release["assets"]
        .as_array()
        .and_then(|a| a.iter().find(|x| x["name"].as_str() == Some(asset_name)))
        .and_then(|a| a["browser_download_url"].as_str())
        .ok_or("Asset not found")?;

    let bytes = client.get(download_url).send().await?.bytes().await?;
    
    let bin_dir = get_bin_dir();
    fs::create_dir_all(&bin_dir)?;
    
    let binary = bin_dir.join(if cfg!(windows) { "qtex.exe" } else { "qtex" });

    #[cfg(windows)]
    {
        let old = binary.with_extension("exe.old");
        let _ = fs::remove_file(&old);
        if binary.exists() { fs::rename(&binary, &old)?; }
        fs::write(&binary, &bytes)?;
        let _ = fs::remove_file(&old);
    }

    #[cfg(not(windows))]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::write(&binary, &bytes)?;
        let mut perms = fs::metadata(&binary)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&binary, perms)?;
    }

    ui::info(&format!("Updated to v{}", latest));
    Ok(())
}
