mod commands;
mod web;

// A grouped use-tree, which a per-line regex mis-parses.
use crate::commands::{config::get_config, config::unused_cmd};

pub fn run() {
    let _ = (get_config, unused_cmd);
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::unused_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
