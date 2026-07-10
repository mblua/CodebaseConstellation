use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};
use constellation_ingest::{scan, HistoryPolicy, ScanOptions};

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
        /// Git history collection policy.
        #[arg(long, value_enum, default_value = "off")]
        history: HistoryPolicy,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Scan { repo, db, history } => {
            let report = scan(&ScanOptions {
                repo,
                database: db,
                history,
            })?;
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{Cli, Command};
    use clap::Parser;
    use constellation_ingest::HistoryPolicy;

    #[test]
    fn cli_defaults_to_history_off() {
        assert_eq!(parse_history(&[]), HistoryPolicy::Off);
    }

    #[test]
    fn cli_accepts_both_history_policies() {
        assert_eq!(parse_history(&["--history", "off"]), HistoryPolicy::Off);
        assert_eq!(parse_history(&["--history", "auto"]), HistoryPolicy::Auto);
    }

    fn parse_history(extra: &[&str]) -> HistoryPolicy {
        let mut arguments = vec![
            "constellation-ingest",
            "scan",
            "--repo",
            "repository",
            "--db",
            "constellation.sqlite",
        ];
        arguments.extend_from_slice(extra);
        let cli = Cli::try_parse_from(arguments).expect("CLI arguments parse");
        let Command::Scan { history, .. } = cli.command;
        history
    }
}
