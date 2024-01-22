#[link(wasm_import_module="camera")]
extern {
    #[link_name = "takeImageStaticSize"]
    fn capture(start: *mut u8, size_ptr: *const u32);
}


const OUT_FILE: &str = "image.jpeg";
const IMG_SIZE: u32 = 3 * 640 * 480;

/// Capture an image, scale it to `width` and `height` and write to output file. Return 0 if
/// successful.
#[no_mangle]
pub fn scaled(width: u32, height: u32) -> i32 {
    let mut buffer = vec![0; IMG_SIZE as usize];
    let buffer_ptr = buffer.as_mut_ptr();
    let size_copy = IMG_SIZE;
    let size_ptr = core::ptr::addr_of!(size_copy);
    unsafe { capture(buffer_ptr, size_ptr); }
    std::fs::write(OUT_FILE, buffer).map(|_| 0).unwrap_or(-1)
}
