mod util;
mod solver;

// Grouped, nested use-trees with an alias and a `self` — a per-line regex mis-parses
// every one of these.
use crate::{
    solver::{run as run_solver, Options},
    util::{self, helper},
};

// A glob import. It cannot be resolved to a specific file without symbol
// resolution, so it goes to `unresolved` rather than becoming a guess.
use crate::solver::*;

// An inline module has no backing file. `mod tests;` would; `mod tests { … }` does not.
#[cfg(test)]
mod tests {
    #[test]
    fn works() {
        assert!(true);
    }
}

pub fn go() {
    let _ = (run_solver, Options, helper, util::helper);
}
