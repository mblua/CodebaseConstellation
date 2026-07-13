// A cargo bin target that lives in the crate the Tauri config anchors. It is the
// desktop app's OWN binary, so it is an `entrypoint`, not a second application.
fn main() {
    fixture_app_lib::run();
}
