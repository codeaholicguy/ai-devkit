mod discover;
mod proto;
mod server;
mod store;

use anyhow::Result;
use server::Daemon;
use std::path::PathBuf;
use std::sync::Arc;

fn data_dir() -> PathBuf {
    dirs_home().join(".ai-devkit")
}

fn dirs_home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"))
}

fn socket_path() -> PathBuf {
    data_dir().join("daemon.sock")
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cmd = std::env::args().nth(1).unwrap_or_else(|| "serve".into());
    match cmd.as_str() {
        "serve" => {
            let daemon = Arc::new(Daemon::new(&data_dir(), socket_path())?);
            daemon.apply_sweep(); // warm the cache before accepting clients
            server::serve(daemon).await
        }
        "install" => install_systemd(),
        "status" => {
            println!("socket: {}", socket_path().display());
            println!("db: {}", data_dir().join("daemon.db").display());
            Ok(())
        }
        other => {
            eprintln!("usage: ai-devkitd [serve|install|status] (got {other})");
            std::process::exit(2);
        }
    }
}

/// Write a systemd --user unit for boot persistence. Optional — clients
/// auto-spawn the daemon on socket-miss, so this is persistence, not startup.
fn install_systemd() -> Result<()> {
    let dir = dirs_home().join(".config/systemd/user");
    std::fs::create_dir_all(&dir)?;
    let exe = std::env::current_exe()?;
    let unit = format!(
        "[Unit]\nDescription=ai-devkit daemon\n\n[Service]\nExecStart={} serve\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n",
        exe.display()
    );
    let path = dir.join("ai-devkitd.service");
    std::fs::write(&path, unit)?;
    println!("wrote {}", path.display());
    println!("enable with: systemctl --user enable --now ai-devkitd.service");
    Ok(())
}
