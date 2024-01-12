#[no_mangle]
pub fn get_index_noop() -> i32 {
    if let Err(_e) = std::fs::copy("original-index.html", "index.html") {
        -1
    } else {
        0
    }
}
