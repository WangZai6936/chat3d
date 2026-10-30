use tauri::Manager;
use std::io::Write;
use tauri_plugin_dialog::DialogExt;

#[cfg(desktop)]
#[macro_use]
mod updater_mirror;
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Fixed-purpose exports only: no caller-supplied paths and no overwrites.
#[tauri::command]
fn save_support_json(app: tauri::AppHandle, contents: String, kind: String) -> Result<String, String> {
    let (prefix, format) = match kind.as_str() {
        "diagnostics" => ("scenivo-diagnostics", "chat3d-diagnostics-v1"),
        "workspace" => ("scenivo-workspace", "chat3d-workspace-backup"),
        _ => return Err("不支持的导出类型".into()),
    };
    if contents.len() > 50 * 1024 * 1024 { return Err("导出文件超过50MB".into()); }
    let value: serde_json::Value = serde_json::from_str(&contents).map_err(|_| "导出内容不是有效JSON")?;
    if value.get("format").and_then(|v| v.as_str()) != Some(format) { return Err("导出格式不匹配".into()); }
    let directory = app.path().download_dir().map_err(|e| e.to_string())?.join("Scenivo");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    for suffix in 0..100 {
        let path = directory.join(format!("{prefix}-{stamp}-{suffix}.json"));
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if let Err(e) = file.write_all(contents.as_bytes()).and_then(|_| file.sync_all()) {
                    drop(file); let _ = std::fs::remove_file(&path); return Err(e.to_string());
                }
                return Ok(path.to_string_lossy().into_owned());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("未能创建唯一文件名，请稍后重试".into())
}

// The frontend supplies only a suggested basename; the native dialog owns the destination.
#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    contents: Vec<u8>,
    kind: String,
    filename: String,
) -> Result<Option<String>, String> {
    let (label, extension) = match kind.as_str() {
        "html" => ("HTML", "html"),
        "glb" => ("GLB", "glb"),
        "json" => ("JSON", "json"),
        _ => return Err("不支持的导出类型".into()),
    };
    if filename.is_empty()
        || filename == "."
        || filename == ".."
        || filename.contains(['/', '\\', ':', '\0'])
    {
        return Err("导出文件名不能包含路径".into());
    }

    // Blocking dialogs must not run on the main event-loop thread.
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file()
            .add_filter(label, &[extension])
            .set_file_name(filename)
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
        file.write_all(&contents).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init());
    // Desktop updates are inactive until a release build supplies an https endpoint
    // and minisign public key. The private signing key stays in the build environment.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());
    #[cfg(desktop)]
    let builder = {
        use updater_mirror::{download_and_install_mirrored_update, update_download_url};
        builder.invoke_handler(tauri::generate_handler![
            greet,
            save_support_json,
            save_export_file,
            update_download_url,
            download_and_install_mirrored_update
        ])
    };
    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![greet, save_support_json, save_export_file]);
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
