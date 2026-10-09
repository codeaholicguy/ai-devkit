//! Gemini session discovery — port of `GeminiSessionLocator`.
//!
//! Sessions live under `~/.gemini/tmp/<shortId>/chats/session-*.{json,jsonl}`.
//! `<shortId>` is either `sha256(projectRoot)` (legacy) or a slug whose owner
//! is recorded in `<shortId>/.project_root`. A session's `projectHash` is
//! matched against sha256 of every ancestor of each candidate process's cwd
//! (Gemini resolves project root by walking up to a `.git` boundary).

use devkit_core::discover::AgentProc;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::shared::{self, SessionFile};

const SESSION_FILE_PREFIX: &str = "session-";
const SESSION_DOC_EXT: &str = ".json";
const SESSION_LOG_EXT: &str = ".jsonl";
const CHATS_DIR: &str = "chats";
const PROJECT_ROOT_MARKER: &str = ".project_root";
const MTIME_SLACK_MS: i64 = 2_000;
/// Both formats lead with sessionId/projectHash; an 8KiB head suffices.
const METADATA_HEAD_BYTES: usize = 8 * 1024;

pub struct GeminiSessionLocator {
    tmp_dir: PathBuf,
}

#[derive(Default)]
struct Metadata {
    session_id: Option<String>,
    project_hash: Option<String>,
}

struct Candidates {
    /// sha256(candidate project root) → process cwd that may own it.
    cwd_by_hash: HashMap<String, String>,
    /// Normalized candidate roots, compared against `.project_root`.
    roots: HashSet<String>,
}

impl GeminiSessionLocator {
    pub fn new(home: &Path) -> Self {
        Self {
            tmp_dir: home.join(".gemini").join("tmp"),
        }
    }

    /// `discoverSessions` — session candidates for these processes.
    pub fn discover_sessions(&self, processes: &[&AgentProc]) -> Vec<SessionFile> {
        let candidates = self.build_candidates(processes);
        if candidates.cwd_by_hash.is_empty() || !self.tmp_dir.is_dir() {
            return Vec::new();
        }
        let min_mtime = earliest_matchable_mtime(processes);
        let mut sessions = Vec::new();

        for short_id in crate::shared::list_dir_names(&self.tmp_dir) {
            let project_dir = self.tmp_dir.join(&short_id);
            if !self.may_belong(&project_dir, &short_id, &candidates) {
                continue;
            }
            let chats_dir = project_dir.join(CHATS_DIR);
            if !chats_dir.is_dir() {
                continue;
            }
            for file_name in list_session_file_names(&chats_dir) {
                if let Some(s) =
                    self.read_candidate(&chats_dir, &file_name, &candidates.cwd_by_hash, min_mtime)
                {
                    sessions.push(s);
                }
            }
        }
        sessions
    }

    fn read_candidate(
        &self,
        chats_dir: &Path,
        file_name: &str,
        cwd_by_hash: &HashMap<String, String>,
        min_mtime: i64,
    ) -> Option<SessionFile> {
        let file_path = chats_dir.join(file_name);
        let stat = std::fs::metadata(&file_path).ok()?;
        let mtime_ms = stat
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        if mtime_ms < min_mtime {
            return None;
        }

        let metadata = self.extract_metadata(&file_path);
        let hash = metadata.project_hash.filter(|h| !h.is_empty())?;
        let resolved_cwd = cwd_by_hash.get(&hash)?;
        let birthtime_ms = stat
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        Some(SessionFile {
            session_id: metadata.session_id.unwrap_or_else(|| {
                // `fileName.replace(/\.jsonl?$/, "")` — one suffix only.
                file_name
                    .strip_suffix(SESSION_LOG_EXT)
                    .or_else(|| file_name.strip_suffix(SESSION_DOC_EXT))
                    .unwrap_or(file_name)
                    .to_string()
            }),
            file_path: file_path.to_string_lossy().into_owned(),
            project_dir: chats_dir.to_string_lossy().into_owned(),
            birthtime_ms,
            resolved_cwd: resolved_cwd.clone(),
        })
    }

    /// `extractSessionMetadata` — bounded head read; `.jsonl` takes line 1,
    /// `.json` parses the head when complete else regex-scans the prefix and
    /// finally the whole file.
    fn extract_metadata(&self, file_path: &Path) -> Metadata {
        let Some((text, complete)) = read_head(file_path, METADATA_HEAD_BYTES) else {
            return Metadata::default();
        };
        let is_log = file_path
            .to_string_lossy()
            .ends_with(SESSION_LOG_EXT);
        if is_log {
            return match text.find('\n') {
                Some(nl) => pick_metadata(text[..nl].parse::<Value>().ok().as_ref()),
                None if complete => pick_metadata(text.parse::<Value>().ok().as_ref()),
                // First line exceeds the head: pick leading keys by regex.
                None => Metadata {
                    session_id: match_string_field(&text, "sessionId"),
                    project_hash: match_string_field(&text, "projectHash"),
                },
            };
        }
        if complete {
            return pick_metadata(text.parse::<Value>().ok().as_ref());
        }
        let session_id = match_string_field(&text, "sessionId");
        let project_hash = match_string_field(&text, "projectHash");
        if session_id.is_some() && project_hash.is_some() {
            return Metadata {
                session_id,
                project_hash,
            };
        }
        let Ok(content) = std::fs::read_to_string(file_path) else {
            return Metadata::default();
        };
        pick_metadata(content.parse::<Value>().ok().as_ref())
    }

    /// `mayBelongToCandidates` — hash dirs must match a candidate hash;
    /// slug dirs defer to their `.project_root` marker; no marker → scan.
    fn may_belong(&self, project_dir: &Path, short_id: &str, candidates: &Candidates) -> bool {
        if is_legacy_hash_dir(short_id) {
            return candidates.cwd_by_hash.contains_key(short_id);
        }
        let marker = project_dir.join(PROJECT_ROOT_MARKER);
        let Ok(content) = std::fs::read_to_string(&marker) else {
            return true;
        };
        if !std::fs::metadata(&marker).map(|m| m.is_file()).unwrap_or(false) {
            return true;
        }
        let root = content.trim();
        if root.is_empty() {
            return true;
        }
        candidates.roots.contains(&normalize_root(root))
    }

    fn build_candidates(&self, processes: &[&AgentProc]) -> Candidates {
        let mut cwd_by_hash = HashMap::new();
        let mut roots = HashSet::new();
        for proc in processes {
            let cwd = proc.cwd.as_deref().unwrap_or("");
            if cwd.is_empty() {
                continue;
            }
            for root in candidate_project_roots(cwd) {
                roots.insert(normalize_root(&root));
                cwd_by_hash
                    .entry(sha256_hex(&root))
                    .or_insert_with(|| cwd.to_string());
            }
        }
        Candidates { cwd_by_hash, roots }
    }
}

fn earliest_matchable_mtime(processes: &[&AgentProc]) -> i64 {
    let mut earliest = i64::MAX;
    for proc in processes {
        if proc.cwd.as_deref().unwrap_or("").is_empty() {
            continue;
        }
        if let Some(start) = proc.start_time_ms {
            earliest = earliest.min(start);
        }
    }
    if earliest == i64::MAX {
        return i64::MIN;
    }
    earliest - shared::MATCH_TOLERANCE_MS - MTIME_SLACK_MS
}

fn is_legacy_hash_dir(name: &str) -> bool {
    name.len() == 64 && name.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

/// `listSessionFileNames` — `session-*.{json,jsonl}`, a `.json` being
/// shadowed by a same-name `.jsonl` (resumed sessions) is skipped.
fn list_session_file_names(chats_dir: &Path) -> Vec<String> {
    let names: Vec<String> = crate::shared::list_dir_names(chats_dir)
        .into_iter()
        .filter(|n| {
            n.starts_with(SESSION_FILE_PREFIX)
                && (n.ends_with(SESSION_DOC_EXT) || n.ends_with(SESSION_LOG_EXT))
        })
        .collect();
    let set: HashSet<String> = names.iter().cloned().collect();
    names
        .into_iter()
        .filter(|n| match n.strip_suffix(SESSION_DOC_EXT) {
            Some(base) => !set.contains(&format!("{base}{SESSION_LOG_EXT}")),
            None => true,
        })
        .collect()
}

/// `readHead` — up to `max+1` bytes; `complete` when the file fits.
fn read_head(path: &Path, max: usize) -> Option<(String, bool)> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; max + 1];
    let mut len = 0;
    while len < buf.len() {
        let n = f.read(&mut buf[len..]).ok()?;
        if n == 0 {
            break;
        }
        len += n;
    }
    let text = String::from_utf8_lossy(&buf[..len.min(max)]).into_owned();
    Some((text, len <= max))
}

/// `matchStringField` — `"key"\s*:\s*"..."` with JSON escape handling.
fn match_string_field(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let mut search_from = 0;
    while let Some(pos) = text[search_from..].find(&needle) {
        let idx = search_from + pos + needle.len();
        let rest = &text[idx..];
        let colon = rest.trim_start().strip_prefix(':');
        let Some(after_colon) = colon else {
            search_from = idx;
            continue;
        };
        let Some(after_quote) = after_colon.trim_start().strip_prefix('"') else {
            search_from = idx;
            continue;
        };
        // Capture up to the closing quote honoring `\` escapes, then
        // decode via a JSON string parse (JSON.parse("\"cap\"") parity).
        let bytes = after_quote.as_bytes();
        let mut i = 0;
        let mut end = None;
        while i < bytes.len() {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == b'"' {
                end = Some(i);
                break;
            }
            i += 1;
        }
        let end = end?;
        let captured = &after_quote[..end];
        return serde_json::from_str::<String>(&format!("\"{captured}\"")).ok();
    }
    None
}

fn pick_metadata(v: Option<&Value>) -> Metadata {
    let Some(v) = v.filter(|v| v.is_object()) else {
        return Metadata::default();
    };
    Metadata {
        session_id: v.get("sessionId").and_then(|s| s.as_str()).map(String::from),
        project_hash: v
            .get("projectHash")
            .and_then(|s| s.as_str())
            .map(String::from),
    }
}

/// `candidateProjectRoots` — cwd plus every ancestor to `/`.
fn candidate_project_roots(cwd: &str) -> Vec<String> {
    let mut roots = Vec::new();
    let mut current = normalize_root(cwd);
    loop {
        let parent = Path::new(&current)
            .parent()
            .map(|p| p.to_string_lossy().into_owned());
        match parent {
            Some(p) if p != current => {
                roots.push(current.clone());
                current = p;
            }
            _ => {
                roots.push(current);
                break;
            }
        }
    }
    roots
}

/// `normalizeRoot`/`path.resolve` — lexical normalization of an absolute
/// path (`..`/`.`/duplicate separators collapsed; no symlink resolution).
fn normalize_root(p: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for part in p.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    format!("/{}", out.join("/"))
}

fn sha256_hex(s: &str) -> String {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(s.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_roots_walk_to_filesystem_root() {
        assert_eq!(
            candidate_project_roots("/a/b/c"),
            vec!["/a/b/c", "/a/b", "/a", "/"]
        );
        assert_eq!(candidate_project_roots("/"), vec!["/"]);
    }

    #[test]
    fn hash_matches_node_crypto() {
        // node: crypto.createHash("sha256").update("/x").digest("hex")
        assert_eq!(
            sha256_hex("/x"),
            "b3d1db318671a024a7e4b433389f8820d6ca466e2cf700afc29f37ed64f2fa0d"
        );
    }

    #[test]
    fn field_regex_handles_escapes() {
        assert_eq!(
            match_string_field(r#"{"sessionId":"a\"b","projectHash":"x"}"#, "sessionId"),
            Some("a\"b".to_string())
        );
        assert_eq!(
            match_string_field(r#"{"sessionId" :  "v"}"#, "sessionId"),
            Some("v".to_string())
        );
        assert_eq!(match_string_field(r#"{"sessionId":5}"#, "sessionId"), None);
    }

    #[test]
    fn json_shadowed_by_jsonl() {
        let dir = std::env::temp_dir().join(format!("gem-shad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("session-a.json"), "{}").unwrap();
        std::fs::write(dir.join("session-a.jsonl"), "{}").unwrap();
        std::fs::write(dir.join("session-b.json"), "{}").unwrap();
        std::fs::write(dir.join("other.json"), "{}").unwrap();
        let mut names = list_session_file_names(&dir);
        names.sort();
        assert_eq!(names, vec!["session-a.jsonl", "session-b.json"]);
        std::fs::remove_dir_all(&dir).ok();
    }
}
