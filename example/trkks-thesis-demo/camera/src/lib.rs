use std::io;
use image::io as iio;

#[link(wasm_import_module="camera")]
extern {
    #[link_name = "takeImageStaticSize"]
    fn capture(start: *mut u8, size_ptr: *const u32);
}


const OUT_FILE: &str = "image.jpeg";
const IMAGE_CHANNELS: u32 = 3;
const CAM_WIDTH: u32 = 640;
const CAM_HEIGHT: u32 = 480;
pub const IMG_SIZE: u32 = IMAGE_CHANNELS * CAM_WIDTH * CAM_HEIGHT;

/// Capture an image, scale it to `width` and `height` and write to output file. Return 0 if
/// successful.
#[no_mangle]
pub fn scaled(width: u32, height: u32) -> i32 {
    let mut jpeg_bytes = vec![0; IMG_SIZE as usize];
    let buffer_ptr = jpeg_bytes.as_mut_ptr();
    let size_copy = IMG_SIZE;
    let size_ptr = core::ptr::addr_of!(size_copy);
    unsafe { capture(buffer_ptr, size_ptr); }

    std::fs::write(OUT_FILE, scaled_jpeg(width, height, jpeg_bytes))
        .map(|_| 0)
        .unwrap_or(-1)
}

pub fn scaled_jpeg(
    width: u32, height: u32, jpeg_bytes: Vec<u8>,
) -> Vec<u8> {
    let img = iio::Reader::with_format(
        io::Cursor::new(jpeg_bytes),
        image::ImageFormat::Jpeg,
    )
    .decode()
    .unwrap();

    let bytes = image::imageops::resize(
        img.as_rgb8().unwrap(),
        width, height,
        image::imageops::FilterType::Nearest,
    );

    let mut scaled_jpeg_bytes = io::BufWriter::new(io::Cursor::new(Vec::new()));
    image::write_buffer_with_format(
        &mut scaled_jpeg_bytes,
        bytes.as_raw(),
        width,
        height,
        image::ColorType::Rgb8,
        image::ImageOutputFormat::Jpeg(80),
    ).unwrap();

    scaled_jpeg_bytes.buffer().to_vec()
}
