use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};
use constellation_ingest::{scan, ScanOptions};

#[derive(Debug, Parser)]
#[command(name = "constellation-ingest")]
#[command(about = "Ingest a Git repository into a CodebaseConstellation v1 database")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Scan one repository into an immutable snapshot.
    Scan {
        /// Path to the Git repository root.
        #[arg(long)]
        repo: PathBuf,
        /// SQLite database to create or update.
        #[arg(long)]
        db: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Scan { repo, db } => {
            let report = scan(&ScanOptions { repo, database: db })?;
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
    }
    Ok(())
}
