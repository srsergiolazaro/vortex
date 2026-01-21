mod ui;
mod compiler;
mod server;
mod installer;

use clap::Parser;
use std::path::PathBuf;
use std::process;
use colored::*;
use notify::{Watcher, RecursiveMode, Config};
use futures::StreamExt;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Parser, Debug)]
#[command(
    name = "qtex",
    version,
    about = "Ultra-fast LaTeX compilation powered by Tachyon-Tex"
)]
struct Args {
    /// Path to the LaTeX project directory containing main.tex
    #[arg(value_name = "PROJECT_DIR")]
    path: Option<PathBuf>,

    /// Enable watch mode: recompile on file changes
    #[arg(short, long)]
    watch: bool,

    /// Set the output PDF filename
    #[arg(short, long, default_value = "output.pdf", value_name = "FILENAME")]
    output: String,

    /// Output results in JSON format
    #[arg(long)]
    json: bool,

    /// Open PDF after compilation (or browser in watch mode)
    #[arg(long)]
    open: bool,

    /// Validate LaTeX syntax without generating PDF
    #[arg(long)]
    verify: bool,

    /// Update qtex to the latest version
    #[arg(short, long)]
    update: bool,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    let version = env!("CARGO_PKG_VERSION");

    if args.update {
        if let Err(e) = installer::self_update().await {
            ui::error(&format!("Update failed: {}", e));
            process::exit(1);
        }
        process::exit(0);
    }

    if !args.json {
        println!("{}", format!("\n🌀 qtex v{}", version).magenta().bold());
    }

    let directory = match &args.path {
        Some(p) => {
            if !p.is_dir() {
                ui::error(&format!("'{}' is not a directory", p.display()));
                process::exit(1);
            }
            p.clone()
        }
        None => PathBuf::from("."),
    };

    if args.watch {
        if args.verify {
            run_verify_watch(&directory, &args).await;
        } else {
            run_watch_mode(&directory, &args).await;
        }
    } else if args.verify {
        run_verify(&directory, &args).await;
    } else {
        run_single_compile(&directory, &args).await;
    }
}

async fn run_verify(directory: &PathBuf, args: &Args) {
    match compiler::verify(directory, args.json).await {
        Ok(_) => {
            if args.json {
                println!("{}", serde_json::json!({ "valid": true }));
            }
        }
        Err(e) => {
            if args.json {
                println!("{}", serde_json::json!({ "valid": false, "error": e.to_string() }));
            } else {
                ui::error(&format!("{}", e));
            }
            process::exit(1);
        }
    }
}

async fn run_verify_watch(directory: &PathBuf, _args: &Args) {
    ui::info(&format!("Watching (verify mode): {}", directory.display().to_string().bold()));

    // Initial verify
    match compiler::verify(directory, true).await {
        Ok(_) => println!("{}", serde_json::json!({ "event": "verify", "valid": true })),
        Err(e) => println!("{}", serde_json::json!({ "event": "verify", "valid": false, "error": e.to_string() })),
    }

    let (mut watcher, mut rx) = async_watcher().expect("Failed to create watcher");
    watcher.watch(directory, RecursiveMode::Recursive).expect("Failed to watch");

    let is_running = Arc::new(Mutex::new(false));
    let last_run = Arc::new(Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(10)));

    while let Some(res) = rx.next().await {
        if let Ok(event) = res {
            if !event.kind.is_modify() && !event.kind.is_create() {
                continue;
            }

            let mut running = is_running.lock().await;
            let mut last = last_run.lock().await;

            if *running || last.elapsed().as_millis() < 500 {
                continue;
            }

            let is_tex = event.paths.iter().any(|p| {
                p.extension().and_then(|e| e.to_str()) == Some("tex")
            });

            if is_tex {
                *running = true;
                *last = std::time::Instant::now();

                match compiler::verify(directory, true).await {
                    Ok(_) => println!("{}", serde_json::json!({ "event": "verify", "valid": true })),
                    Err(e) => println!("{}", serde_json::json!({ "event": "verify", "valid": false, "error": e.to_string() })),
                }

                *running = false;
            }
        }
    }
}

async fn run_single_compile(directory: &PathBuf, args: &Args) {
    match compiler::compile(directory, &args.output, args.json).await {
        Ok(_) => {
            if args.json {
                println!("{}", serde_json::json!({ "success": true }));
            }
            if args.open {
                let output_path = directory.join(&args.output);
                let _ = open::that(output_path);
            }
        }
        Err(e) => {
            if args.json {
                println!("{}", serde_json::json!({ "success": false, "error": e.to_string() }));
            } else {
                ui::error(&format!("Compilation failed: {}", e));
            }
            process::exit(1);
        }
    }
}

async fn run_watch_mode(directory: &PathBuf, args: &Args) {
    let port = 4343;
    let output_path = directory.join(&args.output);

    match server::start_server(port, output_path.clone()).await {
        Ok(actual_port) => {
            let view_url = format!("http://localhost:{}/view", actual_port);
            
            ui::info(&format!("Watching: {}", directory.display().to_string().bold()));
            ui::info(&format!("View: {}", view_url.blue().underline()));

            // Initial compile
            if let Err(e) = compiler::compile(directory, &args.output, true).await {
                println!("{}", serde_json::json!({ "event": "compile", "success": false, "error": e.to_string() }));
            } else {
                println!("{}", serde_json::json!({ "event": "compile", "success": true }));
            }

            if args.open {
                let _ = open::that(&view_url);
            }

            // Watch loop
            let (mut watcher, mut rx) = async_watcher().expect("Failed to create watcher");
            watcher.watch(directory, RecursiveMode::Recursive).expect("Failed to watch");

            let is_compiling = Arc::new(Mutex::new(false));
            let last_compile = Arc::new(Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(10)));
            let watch_exts = ["tex", "bib", "sty", "cls", "png", "jpg", "jpeg", "pdf"];
            let output_name = args.output.clone();

            while let Some(res) = rx.next().await {
                if let Ok(event) = res {
                    if !event.kind.is_modify() && !event.kind.is_create() {
                        continue;
                    }

                    let mut compiling = is_compiling.lock().await;
                    let mut last = last_compile.lock().await;

                    if *compiling || last.elapsed().as_millis() < 500 {
                        continue;
                    }

                    let should_compile = event.paths.iter().any(|p| {
                        p.extension()
                            .and_then(|e| e.to_str())
                            .map(|e| watch_exts.contains(&e) && p.file_name().and_then(|n| n.to_str()) != Some(&output_name))
                            .unwrap_or(false)
                    });

                    if should_compile {
                        *compiling = true;
                        *last = std::time::Instant::now();

                        if let Err(e) = compiler::compile(directory, &output_name, true).await {
                            println!("{}", serde_json::json!({ "event": "compile", "success": false, "error": e.to_string() }));
                        } else {
                            println!("{}", serde_json::json!({ "event": "compile", "success": true }));
                        }

                        *compiling = false;
                    }
                }
            }
        }
        Err(e) => {
            ui::error(&format!("Failed to start server: {}", e));
            process::exit(1);
        }
    }
}

fn async_watcher() -> notify::Result<(notify::RecommendedWatcher, futures::channel::mpsc::Receiver<notify::Result<notify::Event>>)> {
    let (tx, rx) = futures::channel::mpsc::channel(1);

    let watcher = notify::RecommendedWatcher::new(
        move |res| {
            let mut tx = tx.clone();
            futures::executor::block_on(async {
                let _ = tx.try_send(res);
            })
        },
        Config::default(),
    )?;

    Ok((watcher, rx))
}
