use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use tokio::sync::broadcast;
use tower_http::services::ServeFile;
use tower_http::cors::CorsLayer;

static BROADCAST: std::sync::OnceLock<broadcast::Sender<String>> = std::sync::OnceLock::new();

pub async fn start_server(port: u16, output_path: PathBuf) -> Result<u16, Box<dyn std::error::Error>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            kill_port(port);
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            tokio::net::TcpListener::bind(addr).await?
        }
        Err(e) => return Err(e.into()),
    };

    let (tx, _) = broadcast::channel(16);
    let _ = BROADCAST.set(tx);

    let app = Router::new()
        .route("/view", get(view_page))
        .route("/ws", get(ws_handler))
        .route_service("/pdf", ServeFile::new(output_path))
        .layer(CorsLayer::permissive());

    let actual_port = listener.local_addr()?.port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    Ok(actual_port)
}

fn kill_port(port: u16) {
    #[cfg(windows)]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("cmd")
            .args(["/C", &format!("netstat -ano | findstr :{}", port)])
            .output()
        {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                if line.contains("LISTENING") {
                    if let Some(pid) = line.split_whitespace().last() {
                        let _ = Command::new("taskkill").args(["/F", "/PID", pid]).output();
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        use std::process::Command;
        let _ = Command::new("sh")
            .args(["-c", &format!("lsof -ti :{} | xargs kill -9", port)])
            .output();
    }
}

pub async fn notify_clients(path: &Path) {
    if let Some(tx) = BROADCAST.get() {
        let _ = tx.send(path.to_string_lossy().to_string());
    }
}

async fn view_page() -> Html<&'static str> {
    Html(include_str!("view_template.html"))
}

async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    if let Some(tx) = BROADCAST.get() {
        let mut rx = tx.subscribe();
        while let Ok(msg) = rx.recv().await {
            if socket.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    }
}
