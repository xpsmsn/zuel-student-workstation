//! 中南大学生工作台 · 桌面外壳
//!
//! 这一层只做「网页做不到」的几件事，业务逻辑全部留在前端那个单文件原型里：
//!   1. 用系统默认浏览器打开外部链接（校内系统地址 / 邮件）；
//!   2. 把导出文件写进「下载」文件夹（WebView 里 `a[download]` 不落地）；
//!   3. 打开导出目录，方便辅导员找文件；
//!   4. 最小化到系统托盘、后台常驻（v1.8）；
//!   5. 开机自动启动开关（v1.8）。
//!
//! ⚠️ 全程不联网、不上报：这里没有任何网络调用。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/* ---------------- v1.8：托盘与退出行为 ---------------- */
const TRAY_SHOW: &str = "tray_show";
const TRAY_QUIT: &str = "tray_quit";

/// 关闭窗口时是「缩到托盘继续跑」还是「直接退出」。
/// 由前端「系统设置 → 常驻与开机」里的开关改动时同步过来；默认 true（后台常驻）。
static TRAY_MINIMIZE: AtomicBool = AtomicBool::new(true);

/// 取出主窗口并唤到前台。
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// 只允许这三种协议，其余一律拒绝（防止被拼出 `file:` / `cmd:` 之类的危险链接）。
fn url_allowed(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")
}

/// 用系统默认浏览器 / 邮件客户端打开链接。
#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let u = url.trim().to_string();
    if !url_allowed(&u) {
        return Err(format!("不支持的链接协议：{u}"));
    }
    app.opener()
        .open_url(u, None::<&str>)
        .map_err(|e| format!("打开失败：{e}"))
}

/// 取「下载」文件夹（**跨平台**）。
///
/// 顺序：Tauri 的路径解析（Windows → `%USERPROFILE%\Downloads`，
/// macOS / Linux → `$HOME/Downloads`）→ 环境变量兜底 → 系统临时目录。
///
/// ⚠️ 早先这里只读 `USERPROFILE`，那是 **Windows 专有**的环境变量：
/// 在 macOS 上取不到 → 静默退回 `/tmp` → 辅导员导出的 CSV / 备份
/// 会落在一个他永远找不到的地方（表现为"点了导出没反应"）。
fn downloads_dir(app: Option<&tauri::AppHandle>) -> PathBuf {
    if let Some(a) = app {
        if let Ok(d) = a.path().download_dir() {
            if d.is_dir() {
                return d;
            }
        }
    }
    let home_var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    if let Some(home) = std::env::var_os(home_var) {
        let d = PathBuf::from(home).join("Downloads");
        if d.is_dir() {
            return d;
        }
    }
    std::env::temp_dir()
}

/// 拆出「主名 + 扩展名」，用于生成不重名的副本。
fn split_ext(name: &str) -> (String, String) {
    match name.rfind('.') {
        Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()),
        _ => (name.to_string(), String::new()),
    }
}

/// 把导出的字节写进「下载」文件夹，重名自动加 `(1)` `(2)`，返回落盘全路径。
///
/// 走这里而不是浏览器下载，是因为 WebView 里 `a[download]` + `createObjectURL`
/// 往往什么都不发生（不报错、也不出文件），辅导员会以为"导出坏了"。
#[tauri::command]
fn save_to_downloads(app: tauri::AppHandle, name: String, data: Vec<u8>) -> Result<String, String> {
    // 只取文件名部分，挡掉路径穿越
    let raw = name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let base = if raw.is_empty() { "导出.csv" } else { raw };

    let dir = downloads_dir(Some(&app));
    let (stem, ext) = split_ext(base);

    let mut target = dir.join(base);
    let mut i = 1u32;
    while target.exists() && i < 1000 {
        target = dir.join(format!("{stem}({i}){ext}"));
        i += 1;
    }

    std::fs::write(&target, &data).map_err(|e| format!("写入失败：{e}"))?;
    Ok(target.to_string_lossy().to_string())
}

/// 在访达（Windows 是资源管理器）里打开「下载」文件夹。
#[tauri::command]
fn open_downloads_dir(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = downloads_dir(Some(&app));
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("打开失败：{e}"))
}

/// 用系统默认程序打开一个本地文件（v1.9：查寝打分表生成后直接打开打印页）。
/// 只接受「下载」目录、「应用数据」目录，以及**用户在「常用模板 · 我的模板文件」里
/// 亲自登记的文件**（v1.9.6：extra_allowed 由前端把登记清单传过来）。
/// 白名单的意义是挡住"被拼出来的任意路径"；登记清单本身也是本机用户数据，同一信任级别。
#[tauri::command]
fn open_local_file(
    app: tauri::AppHandle,
    path: String,
    extra_allowed: Option<Vec<String>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let p = PathBuf::from(path.trim());
    if !p.is_file() {
        return Err("文件不存在（是不是挪位置或改名了？可在「我的模板文件」里移除后重新添加）".into());
    }
    let data = data_dir(&app)?;
    let mut allowed = vec![downloads_dir(Some(&app)), data];
    if let Some(list) = extra_allowed {
        for a in list {
            let bp = PathBuf::from(a.trim());
            if bp.is_dir() {
                allowed.push(bp);
            }
        }
    }
    let ok = allowed.iter().any(|base| p.starts_with(base));
    if !ok {
        return Err("只允许打开本应用导出的文件或已登记的模板文件".into());
    }
    app.opener()
        .open_path(p.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("打开失败：{e}"))
}

/// 「我的模板文件」登记时要打开的文件：一个文档。
#[derive(serde::Serialize)]
struct DocFile {
    /// 展示名（含扩展名）
    name: String,
    /// 相对所选文件夹的路径（含子文件夹，如 `报销\报账签收表.xlsx`）
    rel: String,
    /// 绝对路径（登记与打开都用它）
    path: String,
}

/// 列出一个文件夹里的常用文档文件（递归，深度 ≤ 3，最多 200 个），
/// 供「常用模板 · 我的模板文件」登记。只列文档类扩展名；
/// 跳过隐藏文件与 Office 锁文件（`~$xxx.docx`）。
#[tauri::command]
fn list_doc_files(dir: String) -> Result<Vec<DocFile>, String> {
    const EXTS: [&str; 8] = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "wps"];
    let root = PathBuf::from(dir.trim());
    if !root.is_dir() {
        return Err(format!("文件夹不存在：{}", root.to_string_lossy()));
    }
    let mut out: Vec<DocFile> = Vec::new();
    walk_docs(&root, &root, 0, &EXTS, &mut out);
    if out.is_empty() {
        return Err("这个文件夹里没有找到 PDF / Word / Excel 文件".into());
    }
    Ok(out)
}

fn walk_docs(root: &std::path::Path, dir: &std::path::Path, depth: u32, exts: &[&str], out: &mut Vec<DocFile>) {
    if depth > 3 || out.len() >= 200 {
        return;
    }
    let rd = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,    // 没权限的子目录直接跳过，不整体失败
    };
    let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('~') || name.starts_with('$') {
            continue;
        }
        if p.is_dir() {
            walk_docs(root, &p, depth + 1, exts, out);
            continue;
        }
        let ext = p
            .extension()
            .map(|x| x.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if !exts.contains(&ext.as_str()) {
            continue;
        }
        let rel = p
            .strip_prefix(root)
            .map(|x| x.to_string_lossy().to_string())
            .unwrap_or_else(|_| name.clone());
        out.push(DocFile {
            name,
            rel,
            path: p.to_string_lossy().to_string(),
        });
    }
}

/// 应用数据目录（%APPDATA%/<identifier>）：清浏览器缓存不会动到这里。
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("定位数据目录失败：{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
    Ok(dir)
}

/// 把一份数据快照固化到应用数据目录（v1.5 数据本地化）。
/// 只允许纯文件名（挡路径穿越），内容为前端写好的 JSON 字符串。
#[tauri::command]
fn save_data_file(app: tauri::AppHandle, name: String, content: String) -> Result<String, String> {
    let raw = name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    if raw.is_empty() {
        return Err("非法文件名".into());
    }
    let dir = data_dir(&app)?;
    let path = dir.join(raw);
    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("写入失败：{e}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// 读回应用数据目录里的快照；不存在返回 None（首次使用 / 未固化过）。
#[tauri::command]
fn load_data_file(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let raw = name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    if raw.is_empty() {
        return Err("非法文件名".into());
    }
    let dir = data_dir(&app)?;
    let path = dir.join(raw);
    if !path.exists() {
        return Ok(None);
    }
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) => Err(format!("读取失败：{e}")),
    }
}

/// 删除应用数据目录里的快照（导入历史删除时清理对应快照文件）。
#[tauri::command]
fn delete_data_file(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let raw = name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    if raw.is_empty() {
        return Err("非法文件名".into());
    }
    let dir = data_dir(&app)?;
    let path = dir.join(raw);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("删除失败：{e}"))?;
    }
    Ok(())
}

/* ---------------- v1.8：托盘 / 开机启动 三个开关命令 ---------------- */

/// 前端开关「关闭窗口时缩到托盘」时同步过来。
#[tauri::command]
fn set_tray_minimize(enable: bool) {
    TRAY_MINIMIZE.store(enable, Ordering::Relaxed);
}

/// 主动缩到托盘（系统设置里的「立即缩到托盘」按钮、以及托盘菜单用）。
#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// 开机自动启动（跨平台，由 tauri-plugin-autostart 落地）。
/// Windows：写当前用户的「启动」目录快捷方式；macOS：写 LaunchAgent plist。
/// 两边都不需要管理员权限。
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enable {
        m.enable().map_err(|e| format!("开启失败：{e}"))?;
    } else {
        m.disable().map_err(|e| format!("关闭失败：{e}"))?;
    }
    Ok(())
}

/// 读当前是否已设为开机启动（设置页打开时校准开关状态）。
#[tauri::command]
fn is_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| format!("读取失败：{e}"))
}

/// 彻底退出（托盘菜单用；缩在托盘时没有窗口可点 ×）。
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // 单实例（v1.9.1）：程序已经在跑时，再双击一次图标不会再开一个窗口，
    // 而是把原来那个叫回前台。必须**第一个**注册，否则可能被别的插件抢先。
    //
    // 顺带挡掉一个隐患：两个实例会同时读写同一份本地数据，后写的会把先写的盖掉。
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 开机自启拉起的那一次，本来就该安安静静待在托盘，不去打扰辅导员
            if args.iter().any(|a| a == "--autostart") {
                return;
            }
            show_main(app);
        }));
    }

    builder
        // 关掉插件自带的"点击 _blank 自动开浏览器"注入脚本：
        // 外链统一走下面自己的 open_external，避免同一次点击被处理两遍（开两个标签页）。
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // 开机启动时带上这个参数，启动后直接缩在托盘、不弹窗打扰
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            open_external,
            save_to_downloads,
            open_downloads_dir,
            save_data_file,
            load_data_file,
            delete_data_file,
            open_local_file,
            list_doc_files,
            set_tray_minimize,
            hide_to_tray,
            set_autostart,
            is_autostart,
            quit_app
        ])
        .setup(|app| {
            /* 托盘：右键出菜单，左键直接唤回窗口 */
            let show = MenuItem::with_id(app, TRAY_SHOW, "打开主窗口", true, None::<&str>)
                .map_err(|e| format!("托盘菜单创建失败：{e}"))?;
            let quit = MenuItem::with_id(app, TRAY_QUIT, "退出", true, None::<&str>)
                .map_err(|e| format!("托盘菜单创建失败：{e}"))?;
            let menu = Menu::with_items(app, &[&show, &quit])
                .map_err(|e| format!("托盘菜单创建失败：{e}"))?;

            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| "缺少应用图标，无法创建托盘".to_string())?;

            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("中南大学生工作台")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    TRAY_SHOW => show_main(app),
                    TRAY_QUIT => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = ev
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)
                .map_err(|e| format!("托盘创建失败：{e}"))?;

            // 开机自启拉起的那一次：直接待在托盘里，不弹主窗口
            if std::env::args().any(|a| a == "--autostart") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // 点「×」时：常驻模式下只隐藏窗口，进程与数据都留在后台
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if TRAY_MINIMIZE.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
