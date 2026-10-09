mod server;

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
            let daemon = Arc::new(Daemon::new(&data_dir(), socket_path(), dirs_home())?);
            daemon.apply_sweep(); // warm the cache before accepting clients
            server::serve(daemon).await
        }
        "install" => {
            #[cfg(target_os = "linux")]
            {
                install_systemd()
            }
            #[cfg(not(target_os = "linux"))]
            {
                // The unit is a systemd --user service — writing it on
                // non-systemd platforms leaves a dead file.
                eprintln!("install writes a systemd --user unit; only supported on Linux");
                std::process::exit(2);
            }
        }
        "status" => {
            println!("socket: {}", socket_path().display());
            println!("db: {}", data_dir().join("daemon.db").display());
            // Probe the socket so status means something: a stale socket
            // file left by a crash reads as "not running", not "up".
            let state = match tokio::net::UnixStream::connect(&socket_path()).await {
                Ok(_) => "listening",
                Err(_) if socket_path().exists() => "stale socket file (daemon down)",
                Err(_) => "not running",
            };
            println!("daemon: {state}");
            Ok(())
        }
        other => {
            eprintln!("usage: devkitd [serve|install|status] (got {other})");
            std::process::exit(2);
        }
    }
}

/// Write a systemd --user unit for boot persistence. Optional — clients
/// auto-spawn the daemon on socket-miss, so this is persistence, not startup.
#[cfg(target_os = "linux")]
fn install_systemd() -> Result<()> {
    let dir = dirs_home().join(".config/systemd/user");
    std::fs::create_dir_all(&dir)?;
    let exe = std::env::current_exe()?;
    let unit = format!(
        "[Unit]\nDescription=ai-devkit daemon\n\n[Service]\nExecStart={} serve\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n",
        exe.display()
    );
    let path = dir.join("devkitd.service");
    std::fs::write(&path, unit)?;
    println!("wrote {}", path.display());
    println!("enable with: systemctl --user enable --now devkitd.service");
    Ok(())
}
