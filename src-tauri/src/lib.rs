// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use tauri::Manager;

/// Seconds the loopback listener waits for Spotify to redirect back.
const OAUTH_TIMEOUT: Duration = Duration::from_secs(300);

const SUCCESS_HTML: &str = r#"<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>Harmonic Playlist</title>
<style>
  html,body{height:100%;margin:0;background:#08080b;color:#e8ecf5;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    display:flex;align-items:center;justify-content:center}
  .card{max-width:420px;padding:40px;border-radius:24px;text-align:center;
    background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
  .dot{width:52px;height:52px;border-radius:50%;margin:0 auto 20px;
    background:radial-gradient(circle,#3DFFB0,#00E5FF 70%);box-shadow:0 0 40px #3DFFB080}
  h1{font-size:18px;margin:0 0 8px;letter-spacing:.02em}
  p{margin:0;font-size:13px;line-height:1.6;color:#9aa4b8}
</style></head>
<body><div class="card"><div class="dot"></div>
<h1>Giriş tamamlandı</h1>
<p>Harmonic Playlist'e dönebilirsin. Bu sekmeyi kapatabilirsin.</p>
</div></body></html>"#;

const FAILURE_HTML: &str = r#"<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>Harmonic Playlist</title>
<style>
  html,body{height:100%;margin:0;background:#08080b;color:#e8ecf5;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    display:flex;align-items:center;justify-content:center}
  .card{max-width:420px;padding:40px;border-radius:24px;text-align:center;
    background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
  h1{font-size:18px;margin:0 0 8px;color:#ff8fb5}
  p{margin:0;font-size:13px;line-height:1.6;color:#9aa4b8}
</style></head>
<body><div class="card"><h1>Giriş tamamlanamadı</h1>
<p>Uygulamaya dönüp yeniden deneyebilirsin.</p>
</div></body></html>"#;

/// Reads the request line and query string of a single HTTP request.
fn read_request(stream: &mut std::net::TcpStream) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).ok()?;

    // Drain headers so the browser does not see a reset before the response.
    let mut header = String::new();
    while reader.read_line(&mut header).map(|n| n > 2).unwrap_or(false) {
        header.clear();
    }

    let path = request_line.split_whitespace().nth(1)?;
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    Some(query.to_string())
}

fn respond(stream: &mut std::net::TcpStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// Loopback OAuth receiver for the desktop build.
///
/// Spotify refuses `localhost` and custom schemes, so the desktop app registers
/// `http://127.0.0.1:8888/auth/callback`. This command binds that port and hands
/// the raw query string (`code=…&state=…`) back to the webview, which then
/// exchanges the code with PKCE.
#[tauri::command]
async fn oauth_callback_listener(port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
            format!("127.0.0.1:{port} dinlenemedi ({e}). Başka bir uygulama portu kullanıyor olabilir.")
        })?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;

        let started = Instant::now();
        loop {
            if started.elapsed() > OAUTH_TIMEOUT {
                return Err("Spotify yanıtı 5 dakika içinde gelmedi.".to_string());
            }

            match listener.accept() {
                Ok((mut stream, _addr)) => {
                    let Some(query) = read_request(&mut stream) else { continue };

                    // Browsers also request /favicon.ico; only answer the callback.
                    if !query.contains("code=") && !query.contains("error=") {
                        respond(&mut stream, FAILURE_HTML);
                        continue;
                    }

                    respond(&mut stream, SUCCESS_HTML);
                    return Ok(query);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(120));
                }
                Err(e) => return Err(format!("Loopback dinleyicisi hata verdi: {e}")),
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![oauth_callback_listener])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use tauri::TitleBarStyle;
                    let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
                }
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Harmonic Playlist");
}
