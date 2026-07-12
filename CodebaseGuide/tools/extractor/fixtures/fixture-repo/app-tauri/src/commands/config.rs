// This next line is a COMMENT mentioning `#[tauri::command]`. An unanchored grep
// counts it; a parser that strips comments does not. That difference is exactly how
// "135" became "134".
use super::super::web;

#[tauri::command]
pub fn get_config() -> String {
    let _ = web::commands::route;
    "{}".to_string()
}

#[tauri::command]
pub fn unused_cmd() -> u32 {
    // Registered in generate_handler!, but never called through the facade.
    7
}

// An attribute that is NOT anchored at the start of a line: /* #[tauri::command] */
pub fn not_a_command() {}
