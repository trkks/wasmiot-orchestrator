//! This crate contains functions that for testing purposes are used to demonstrate how a separate
//! "main script" on client side can interact with a WebAssembly module on server side. Also the
//! module instance's state is manipulated and upheld between requests with the use of the static
//! `TIME` variable.

/// This function merely copies the deployment-stage index.html file to the output path, because
/// output files are expected to be created by running a Wasm function.
#[no_mangle]
pub fn index() -> u64 {
    std::fs::copy("deploy-index.html", "index.html")
        .unwrap()
}

#[link(wasm_import_module="sys")]
extern {
    #[link_name="millis"]
    fn millis() -> u32;
}

static mut TIME: Option<u32> = None;

/// Initialize the current TIME.
#[no_mangle]
pub fn now() {
    unsafe { TIME = Some(millis()) };
}

#[no_mangle]
pub fn seconds() -> u32 {
    (unsafe { TIME.unwrap_or(0) }) / 1000
}

#[no_mangle]
pub fn minutes() -> u32 {
    seconds() / 60
}

#[no_mangle]
pub fn hours() -> u32 {
    minutes() / 60
}
