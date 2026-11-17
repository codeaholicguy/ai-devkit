//! Process identity matches TS LocalProcessInspector for legacy adoption.
use anyhow::{Context, Result};
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
        let out = std::process::Command::new("ps")
            .args(["-o", "lstart=", "-p", &pid.to_string()])
            .output()?;
        if out.status.success() {
            let s = String::from_utf8(out.stdout)?.trim().to_string();
            Ok((!s.is_empty()).then_some((pid, s)))
        } else if out.status.code() == Some(1) {
            Ok(None)
        } else {
            anyhow::bail!("process probe failed")
        }
    }
}
