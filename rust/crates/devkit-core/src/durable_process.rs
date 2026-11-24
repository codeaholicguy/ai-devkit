//! Process identity matches TS LocalProcessInspector for legacy adoption.
#[cfg(target_os = "linux")]
use anyhow::Context;
use anyhow::Result;

#[cfg(any(not(target_os = "linux"), test))]
fn parse_ps_stat_lstart(output: &str) -> Option<String> {
    let trimmed = output.trim();
    let mut parts = trimmed.splitn(2, char::is_whitespace);
    let stat = parts.next()?;
    if stat.starts_with('Z') || stat.starts_with('X') {
        return None;
    }
    let lstart = parts.next()?.trim();
    (!lstart.is_empty()).then(|| lstart.to_string())
}

/// None means absent/zombie; Err means observation failed and must be retried.
pub fn identity(pid: i64) -> Result<Option<(i64, String)>> {
    if pid <= 0 || pid > i32::MAX as i64 {
        return Ok(None);
    }
    #[cfg(target_os = "linux")]
    {
        let s = match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let (_, fields) = s.rsplit_once(')').context("invalid process stat")?;
        let f: Vec<_> = fields.split_whitespace().collect();
        if matches!(f.first(), Some(&"Z") | Some(&"X")) {
            return Ok(None);
        }
        Ok(Some((
            pid,
            format!("linux:{}", f.get(19).context("missing process start")?),
        )))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let ps = if std::path::Path::new("/bin/ps").exists() {
            "/bin/ps"
        } else {
            "ps"
        };
        let out = std::process::Command::new(ps)
            .args(["-o", "stat=,lstart=", "-p", &pid.to_string()])
            .output()?;
        if out.status.success() {
            let stdout = String::from_utf8(out.stdout)?;
            Ok(parse_ps_stat_lstart(&stdout).map(|s| (pid, s)))
        } else if out.status.code() == Some(1) {
            Ok(None)
        } else {
            anyhow::bail!("process probe failed")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ps_stat_lstart_extracts_lstart_and_filters_zombies() {
        assert_eq!(
            parse_ps_stat_lstart("S+   Fri Nov 20 21:21:40 2026    \n").as_deref(),
            Some("Fri Nov 20 21:21:40 2026")
        );
        assert_eq!(
            parse_ps_stat_lstart("Z+   Fri Nov 20 21:21:40 2026    \n"),
            None
        );
        assert_eq!(
            parse_ps_stat_lstart("X    Fri Nov 20 21:21:40 2026\n"),
            None
        );
        assert_eq!(parse_ps_stat_lstart(""), None);
        assert_eq!(parse_ps_stat_lstart("S+\n"), None);
    }

    #[cfg(not(target_os = "linux"))]
    #[test]
    fn identity_treats_unreaped_zombie_as_absent() {
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .unwrap();
        let pid = child.id() as i64;
        assert!(identity(pid).unwrap().is_some());
        child.kill().unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while identity(pid).unwrap().is_some() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let observed = identity(pid).unwrap();
        let _ = child.wait();
        assert_eq!(observed, None);
    }
}
