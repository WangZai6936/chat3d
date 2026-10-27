// Download a checked update from a chosen mirror. `Update::download` still verifies the
// manifest signature with the build-time public key before `install` runs.
// Keep the known origins in sync with shared/update-mirrors.mjs.
use tauri::{ipc::Channel, Manager, ResourceId, Runtime, Webview};
use url::Url;

const PORTAL_PUBLIC_ORIGIN: &str = "https://portal.jiezi-ai.com";
const PORTAL_DIRECT_ORIGIN: &str = "http://36.133.218.210:38008";

#[derive(Clone, serde::Serialize)]
#[serde(tag = "event", content = "data")]
pub(crate) enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

fn acceptable_download_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url.username().is_empty()
        && url.password().is_none()
        && url.as_str().len() <= 500
}

fn same_download(left: &Url, right: &Url) -> bool {
    left.origin() == right.origin() && left.path() == right.path() && left.query() == right.query()
}

fn known_origin(url: &Url) -> bool {
    [PORTAL_PUBLIC_ORIGIN, PORTAL_DIRECT_ORIGIN]
        .into_iter()
        .any(|origin| {
            Url::parse(origin)
                .map(|known| known.origin() == url.origin())
                .unwrap_or(false)
        })
}

fn known_sibling(primary: &Url, requested: &Url) -> bool {
    primary.path().contains("/desktop-updates/")
        && known_origin(primary)
        && known_origin(requested)
        && primary.path() == requested.path()
        && primary.query() == requested.query()
}

fn listed_in_manifest(raw: &serde_json::Value, primary: &Url, requested: &Url) -> bool {
    let Some(platforms) = raw.get("platforms").and_then(|value| value.as_object()) else {
        return false;
    };
    for item in platforms.values() {
        let Some(url) = item.get("url").and_then(|value| value.as_str()) else {
            continue;
        };
        let Ok(platform_url) = Url::parse(url) else {
            continue;
        };
        if !same_download(&platform_url, primary) {
            continue;
        }
        if same_download(&platform_url, requested) {
            return true;
        }
        let Some(mirrors) = item.get("mirrors").and_then(|value| value.as_array()) else {
            continue;
        };
        for mirror in mirrors {
            let Some(text) = mirror.as_str() else {
                continue;
            };
            if let Ok(parsed) = Url::parse(text) {
                if acceptable_download_url(&parsed) && same_download(&parsed, requested) {
                    return true;
                }
            }
        }
    }
    false
}

fn allowed_download_url(update: &tauri_plugin_updater::Update, requested: &Url) -> bool {
    if !acceptable_download_url(requested) {
        return false;
    }
    if same_download(&update.download_url, requested) {
        return true;
    }
    if known_sibling(&update.download_url, requested) {
        return true;
    }
    listed_in_manifest(&update.raw_json, &update.download_url, requested)
}

fn checked_update<R: Runtime>(
    webview: &Webview<R>,
    rid: ResourceId,
) -> Result<tauri_plugin_updater::Update, String> {
    let table = webview.resources_table();
    let update = table
        .get::<tauri_plugin_updater::Update>(rid)
        .map_err(|err| err.to_string())?;
    Ok((*update).clone())
}

#[tauri::command]
pub fn update_download_url<R: Runtime>(
    webview: Webview<R>,
    rid: ResourceId,
) -> Result<String, String> {
    Ok(checked_update(&webview, rid)?.download_url.to_string())
}

#[tauri::command]
pub async fn download_and_install_mirrored_update<R: Runtime>(
    webview: Webview<R>,
    rid: ResourceId,
    url: String,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let mut update = checked_update(&webview, rid)?;
    let requested = Url::parse(&url).map_err(|_| "更新下载地址无效".to_string())?;
    if !allowed_download_url(&update, &requested) {
        return Err("该下载地址不在这次更新的镜像列表中".into());
    }
    update.download_url = requested;
    let mut first_chunk = true;
    let bytes = update
        .download(
            |chunk_length, content_length| {
                if first_chunk {
                    first_chunk = false;
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|err| err.to_string())?;
    update.install(bytes).map_err(|err| err.to_string())?;
    Ok(())
}
