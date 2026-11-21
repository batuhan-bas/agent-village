mod hooks;

use std::io::Read;
use std::thread;

use tauri::{AppHandle, Emitter};

/// Hook events arrive here as JSON (Claude Code hooks POST their stdin).
const ADDR: &str = "127.0.0.1:4343";
/// Hook payloads are a few KB; anything bigger than this is cut off (and fails to parse).
const MAX_BODY: u64 = 256 * 1024;

fn serve(app: AppHandle) {
    let server = match tiny_http::Server::http(ADDR) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("agent-village: cannot listen on {ADDR}: {e}");
            return;
        }
    };
    for mut req in server.incoming_requests() {
        let mut body = String::new();
        // Browsers always send Origin on a cross-site POST; hooks (curl, Claude Code) never do.
        // Without this check any open web page could post fake events to the village.
        let from_browser = req.headers().iter().any(|h| h.field.equiv("Origin"));
        let status = if req.url() != "/event" || *req.method() != tiny_http::Method::Post {
            404
        } else if from_browser {
            403
        } else if req.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
            400
        } else {
            match serde_json::from_str::<serde_json::Value>(&body) {
                Ok(event) => {
                    let _ = app.emit("agent-event", event);
                    204
                }
                Err(_) => 400,
            }
        };
        let _ = req.respond(tiny_http::Response::empty(status));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![hooks::hook_status, hooks::set_hooks])
        .setup(|app| {
            let handle = app.handle().clone();
            thread::spawn(move || serve(handle));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
