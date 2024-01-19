#[no_mangle]
pub fn index() -> i32 {
    if let Err(_e) = std::fs::copy("deploy-index.html", "index.html") {
        -1
    } else {
        0
    }
}
