// The shipped WebSocket router. `get_config` is bound to BOTH backends; `ws_only`
// is bound to this one alone — it has no #[tauri::command], so it is unresolved as
// Tauri, and the coverage record has to say so.
pub fn route(cmd: &str) -> u8 {
    match cmd {
        "get_config" => 1,
        "ws_only" => 2,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decoy_router(cmd: &str) -> u8 {
        // A real `match cmd` arm that is NOT part of the shipped router. If the
        // extractor scanned inside #[cfg(test)], `never_shipped` would become a
        // web-command that does not exist.
        match cmd {
            "never_shipped" => 99,
            _ => 0,
        }
    }

    #[test]
    fn routes() {
        assert_eq!(route("get_config"), 1);
        assert_eq!(decoy_router("never_shipped"), 99);
    }
}
