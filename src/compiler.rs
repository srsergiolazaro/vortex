use std::path::Path;
use std::fs;
use reqwest::multipart::{Form, Part};
use crate::ui::Spinner;
use colored::*;

const API_BASE: &str = "https://latex.taptapp.xyz";

const ALLOWED_EXTS: [&str; 17] = [
    "tex", "bib", "sty", "cls", "bst",
    "pdf", "png", "jpg", "jpeg", "eps",
    "csv", "dat", "tsv", "txt",
    "tikz", "otf", "ttf"
];

pub async fn compile(dir: &Path, output_name: &str, silent: bool) -> Result<(), Box<dyn std::error::Error>> {
    let spinner = if silent { None } else { Some(Spinner::new("Compiling...")) };

    let absolute_dir = fs::canonicalize(dir)?;
    let mut form = Form::new();
    let mut file_count = 0;

    for entry in walkdir::WalkDir::new(&absolute_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        
        if !ALLOWED_EXTS.contains(&ext.as_str()) {
            continue;
        }

        // Skip output file
        if path.file_name().and_then(|s| s.to_str()) == Some(output_name) {
            continue;
        }

        let relative = path.strip_prefix(&absolute_dir)?.to_string_lossy().replace('\\', "/");
        let content = fs::read(path)?;
        
        form = form.part("files", Part::bytes(content).file_name(relative));
        file_count += 1;
    }

    if file_count == 0 {
        if let Some(s) = spinner { s.fail("No files found"); }
        return Err("No LaTeX files found".into());
    }

    if let Some(ref s) = spinner { s.update("Sending to server..."); }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/compile", API_BASE))
        .multipart(form)
        .send()
        .await?;

    if response.status().is_success() {
        let compile_time: String = response.headers()
            .get("x-compile-time-ms")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("?")
            .to_string();

        let bytes = response.bytes().await?;
        let output_path = dir.join(output_name);
        fs::write(&output_path, bytes)?;

        if let Some(s) = spinner {
            s.succeed(&format!("Done in {}ms → {}", compile_time.bold(), output_path.display()));
        }

        crate::server::notify_clients(&output_path).await;
        Ok(())
    } else {
        let err = response.text().await?;
        if let Some(s) = spinner { s.fail("Compilation failed"); }
        Err(err.into())
    }
}

pub async fn verify(dir: &Path, silent: bool) -> Result<(), Box<dyn std::error::Error>> {
    let spinner = if silent { None } else { Some(Spinner::new("Validating...")) };

    let absolute_dir = fs::canonicalize(dir)?;
    let mut form = Form::new();
    let mut file_count = 0;

    for entry in walkdir::WalkDir::new(&absolute_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        
        if ext != "tex" {
            continue;
        }

        let relative = path.strip_prefix(&absolute_dir)?.to_string_lossy().replace('\\', "/");
        let content = fs::read(path)?;
        
        form = form.part("files", Part::bytes(content).file_name(relative));
        file_count += 1;
    }

    if file_count == 0 {
        if let Some(s) = spinner { s.fail("No .tex files found"); }
        return Err("No LaTeX files found".into());
    }

    if let Some(ref s) = spinner { s.update("Sending to server..."); }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/validate", API_BASE))
        .multipart(form)
        .send()
        .await?;

    if response.status().is_success() {
        #[derive(serde::Deserialize)]
        struct ValidationResponse {
            valid: bool,
            errors: Option<Vec<ValidationError>>,
        }
        #[derive(serde::Deserialize)]
        struct ValidationError {
            line: Option<u32>,
            message: String,
        }

        let result: ValidationResponse = response.json().await?;
        
        if result.valid {
            if let Some(s) = spinner { s.succeed("Validation passed ✓"); }
            Ok(())
        } else {
            if let Some(s) = spinner { s.fail("Validation failed"); }
            let errors = result.errors.unwrap_or_default();
            let msg = errors.iter()
                .map(|e| format!("[Line {:?}] {}", e.line, e.message))
                .collect::<Vec<_>>()
                .join("\n");
            Err(msg.into())
        }
    } else {
        let err = response.text().await?;
        if let Some(s) = spinner { s.fail("Validation request failed"); }
        Err(err.into())
    }
}
