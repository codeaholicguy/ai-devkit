//! Minimal print-protocol result extraction. Fixtures are shared with TS.
use anyhow::{bail, ensure, Result};
use devkit_core::store::durable::is_uuid;
use serde_json::Value;
const MAX_LINE: usize = 1024 * 1024;
#[derive(Debug)]
pub struct PrintResult {
    pub session_id: String,
    pub text: String,
}
pub struct PrintParser {
    provider: &'static str,
    expected: Option<String>,
    session: Option<String>,
    pending: Vec<u8>,
    ended: bool,
    text: Option<String>,
    terminal: bool,
}
impl PrintParser {
    pub fn new(provider: &'static str, expected: Option<&str>) -> Self {
        Self {
            provider,
            expected: expected.map(str::to_owned),
            session: None,
            pending: Vec::new(),
            ended: false,
            text: None,
            terminal: false,
        }
    }
    pub fn session_id(&self) -> Option<&str> {
        self.session.as_deref()
    }
    pub fn accept(&mut self, chunk: &[u8]) -> Result<()> {
        for b in chunk {
            if *b == b'\n' {
                let line = std::mem::take(&mut self.pending);
                if !line.is_empty() {
                    self.line(&line)?;
                }
            } else {
                ensure!(
                    self.pending.len() < MAX_LINE,
                    "protocol: stream line exceeded the safety limit"
                );
                self.pending.push(*b);
            }
        }
        Ok(())
    }
    fn line(&mut self, line: &[u8]) -> Result<()> {
        let e: Value = serde_json::from_slice(line)?;
        ensure!(e.is_object(), "protocol: non-object stream message");
        match self.provider {
            "claude" => {
                if let Some(s) = e["session_id"].as_str() {
                    ensure!(
                        Some(s) == self.expected.as_deref(),
                        "session_mismatch: Claude returned a different session identity"
                    );
                }
                if e["type"] == "result" {
                    ensure!(!self.terminal, "protocol: multiple terminal results");
                    let sid = e["session_id"]
                        .as_str()
                        .ok_or_else(|| anyhow::anyhow!("protocol: missing session"))?;
                    self.session = Some(sid.into());
                    self.text = Some(
                        e["result"]
                            .as_str()
                            .ok_or_else(|| anyhow::anyhow!("protocol: invalid result"))?
                            .into(),
                    );
                    self.terminal = true;
                    self.ended = true;
                }
            }
            "codex" => match e["type"].as_str() {
                Some("thread.started") => self.session(&e["thread_id"])?,
                Some("turn.completed") => self.ended = true,
                Some("item.completed") if e["item"]["type"] == "agent_message" => {
                    if let Some(s) = e["item"]["text"].as_str().filter(|s| !s.trim().is_empty()) {
                        self.text = Some(s.into());
                    }
                }
                _ => {}
            },
            "pi" => match e["type"].as_str() {
                Some("session") => self.session(&e["id"])?,
                Some("agent_end") => self.ended = true,
                Some("message_end") if e["message"]["role"] == "assistant" => {
                    let content = &e["message"]["content"];
                    let text = if let Some(s) = content.as_str() {
                        s.to_string()
                    } else {
                        content
                            .as_array()
                            .map(|a| {
                                a.iter()
                                    .filter(|b| b["type"] == "text")
                                    .filter_map(|b| b["text"].as_str())
                                    .collect::<String>()
                            })
                            .unwrap_or_default()
                    };
                    if !text.trim().is_empty() {
                        self.text = Some(text);
                    }
                }
                _ => {}
            },
            _ => bail!("unsupported provider"),
        }
        Ok(())
    }
    fn session(&mut self, sid: &Value) -> Result<()> {
        let sid = sid
            .as_str()
            .filter(|s| is_uuid(s))
            .ok_or_else(|| anyhow::anyhow!("protocol: invalid session identity"))?;
        ensure!(
            self.session.is_none(),
            "protocol: duplicate session identity"
        );
        if let Some(expected) = &self.expected {
            ensure!(
                expected == sid,
                "session_mismatch: returned a different session identity"
            );
        }
        self.session = Some(sid.into());
        Ok(())
    }
    pub fn finish(self, code: Option<i32>) -> Result<PrintResult> {
        ensure!(
            self.pending.is_empty(),
            "protocol: stream ended with incomplete JSON"
        );
        ensure!(
            code == Some(0),
            "process_failed: provider print run failed (exit {code:?})"
        );
        ensure!(self.ended, "protocol: stream ended without completion");
        Ok(PrintResult {
            session_id: self
                .session
                .ok_or_else(|| anyhow::anyhow!("protocol: missing session identity"))?,
            text: self
                .text
                .ok_or_else(|| anyhow::anyhow!("protocol: missing assistant result"))?,
        })
    }
}
