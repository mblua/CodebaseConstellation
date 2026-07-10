use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context, Result};

#[derive(Debug, Clone)]
pub(crate) struct CommitRecord {
    pub hash: String,
    pub parents: Vec<String>,
    pub authored_at: String,
    pub message: String,
    pub changed_paths: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct RepositoryInfo {
    pub root: PathBuf,
    pub name: String,
    pub slug: String,
    pub remote_url: Option<String>,
    pub revision: String,
    pub shallow: bool,
    pub dirty: bool,
    pub commits: Vec<CommitRecord>,
}

impl RepositoryInfo {
    pub fn stable_key(&self) -> String {
        format!("repo:{}", self.slug)
    }

    pub fn history_mode(&self) -> &'static str {
        if self.shallow {
            "shallow"
        } else {
            "full"
        }
    }
}

pub(crate) fn inspect_repository(path: &Path, collect_history: bool) -> Result<RepositoryInfo> {
    let root = fs::canonicalize(path)
        .with_context(|| format!("cannot resolve repository path {}", path.display()))?;
    if !root.is_dir() {
        bail!("repository path is not a directory: {}", root.display());
    }

    let inside = git_text(&root, ["rev-parse", "--is-inside-work-tree"])?;
    if inside.trim() != "true" {
        bail!("path is not inside a Git work tree: {}", root.display());
    }
    let top_level = PathBuf::from(git_text(&root, ["rev-parse", "--show-toplevel"])?.trim());
    let top_level = fs::canonicalize(&top_level)
        .with_context(|| format!("cannot resolve Git top level {}", top_level.display()))?;
    if top_level != root {
        bail!(
            "--repo must name the Git repository root (received {}, root is {})",
            root.display(),
            top_level.display()
        );
    }

    let revision = git_text(&root, ["rev-parse", "HEAD"])?.trim().to_owned();
    let shallow = if collect_history {
        git_text(&root, ["rev-parse", "--is-shallow-repository"])?.trim() == "true"
    } else {
        false
    };
    let dirty = !git_bytes(
        &root,
        ["status", "--porcelain=v1", "--untracked-files=no", "-z"],
    )?
    .is_empty();
    let remote_url = git_text(&root, ["remote", "get-url", "origin"])
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let fallback_name = root
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("repository")
        .strip_prefix("repo-")
        .unwrap_or_else(|| {
            root.file_name()
                .and_then(OsStr::to_str)
                .unwrap_or("repository")
        })
        .to_owned();
    let name = remote_url
        .as_deref()
        .and_then(remote_repository_name)
        .unwrap_or(fallback_name);
    let slug = slugify(&name);
    if slug.is_empty() {
        bail!("repository name {name:?} cannot form a stable-key slug");
    }
    // History-off scans stop here: no rev-list, show, or diff-tree traversal.
    let commits = if collect_history {
        read_commits(&root)?
    } else {
        Vec::new()
    };

    Ok(RepositoryInfo {
        root,
        name,
        slug,
        remote_url,
        revision,
        shallow,
        dirty,
        commits,
    })
}

pub(crate) fn tracked_paths(repo: &Path) -> Result<Vec<String>> {
    let output = git_bytes(repo, ["ls-files", "--cached", "-z"])?;
    let mut paths = Vec::new();
    for raw in output
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
    {
        let path = std::str::from_utf8(raw)
            .context("Git path is not valid UTF-8; v1 stable keys require UTF-8")?
            .replace('\\', "/");
        validate_relative_path(&path)?;
        paths.push(path);
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn read_commits(repo: &Path) -> Result<Vec<CommitRecord>> {
    let hashes = git_text(repo, ["rev-list", "--topo-order", "HEAD"])?;
    let mut commits = Vec::new();
    for hash in hashes
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let raw = git_bytes(
            repo,
            ["show", "-s", "--format=%H%x00%P%x00%aI%x00%B%x00", hash],
        )?;
        let fields: Vec<&[u8]> = raw.split(|byte| *byte == 0).collect();
        if fields.len() < 4 {
            bail!("unexpected metadata from git show for commit {hash}");
        }
        let full_hash = utf8(fields[0], "commit hash")?.trim().to_owned();
        let parents = utf8(fields[1], "commit parents")?
            .split_whitespace()
            .map(str::to_owned)
            .collect();
        let authored_at = utf8(fields[2], "commit timestamp")?.trim().to_owned();
        let message = utf8(fields[3], "commit message")?.trim().to_owned();

        let changed = git_bytes(
            repo,
            [
                "diff-tree",
                "--first-parent",
                "--root",
                "--no-commit-id",
                "--name-only",
                "-r",
                "-z",
                hash,
            ],
        )?;
        let mut changed_paths = Vec::new();
        for raw_path in changed
            .split(|byte| *byte == 0)
            .filter(|path| !path.is_empty())
        {
            let path = utf8(raw_path, "changed path")?.replace('\\', "/");
            validate_relative_path(&path)?;
            changed_paths.push(path);
        }
        changed_paths.sort();
        changed_paths.dedup();
        commits.push(CommitRecord {
            hash: full_hash,
            parents,
            authored_at,
            message,
            changed_paths,
        });
    }
    Ok(commits)
}

fn git_text<const N: usize>(repo: &Path, args: [&str; N]) -> Result<String> {
    let bytes = git_bytes(repo, args)?;
    String::from_utf8(bytes).context("Git output is not valid UTF-8")
}

fn git_bytes<I, S>(repo: &Path, args: I) -> Result<Vec<u8>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = Command::new("git")
        .args(args)
        .current_dir(repo)
        .output()
        .with_context(|| "failed to launch git; install Git and ensure it is on PATH")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        bail!("git command failed: {stderr}");
    }
    Ok(output.stdout)
}

fn utf8<'a>(bytes: &'a [u8], label: &str) -> Result<&'a str> {
    std::str::from_utf8(bytes).with_context(|| format!("{label} is not valid UTF-8"))
}

fn validate_relative_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.starts_with('/')
        || path.starts_with("./")
        || path.contains('\\')
        || path.split('/').any(|part| part.is_empty() || part == "..")
    {
        bail!("Git returned a path outside the v1 stable-key contract: {path:?}");
    }
    Ok(())
}

fn remote_repository_name(remote: &str) -> Option<String> {
    let trimmed = remote.trim_end_matches('/').trim_end_matches(".git");
    trimmed
        .rsplit(['/', ':'])
        .next()
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut pending_separator = false;
    for character in name.chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            if pending_separator && !slug.is_empty() {
                slug.push('-');
            }
            pending_separator = false;
            slug.push(character);
        } else {
            pending_separator = true;
        }
    }
    slug
}

#[cfg(test)]
mod tests {
    use super::{remote_repository_name, slugify};

    #[test]
    fn derives_stable_repository_identity() {
        assert_eq!(
            remote_repository_name("https://github.com/mblua/AgentsCommander.git").as_deref(),
            Some("AgentsCommander")
        );
        assert_eq!(
            remote_repository_name("git@host:org/example.git").as_deref(),
            Some("example")
        );
        assert_eq!(slugify("Agents Commander_v2"), "agents-commander-v2");
    }
}
