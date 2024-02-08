use std::io;

use image::io as iio;

use snake::{snake_adapter, snake::GameObject};


/// Declare remote procedure calls hardcoded for this application to use.
#[allow(dead_code, unused_doc_comments)]
#[link(wasm_import_module="rpc")]
extern {
    /// Writes a JPEG image into the memory location.
    #[link_name="camera_capture"]
    fn jpeg_(start: *mut u8, size_ptr: *const u32);

    /// Writes bytes into the memory location.
    #[link_name="next_game_frame"]
    fn octet_stream_(start: *mut u8, size_ptr: *const u32);
}

fn save_data(
    data_size: usize,
    f: unsafe extern fn(*mut u8, *const u32),
) -> Vec<u8> {
    let mut buffer = vec![0; data_size];
    let buffer_ptr = buffer.as_mut_ptr();
    let size_copy = data_size;
    let size_ptr = core::ptr::addr_of!(size_copy) as *const u32;
    unsafe {
        f(buffer_ptr, size_ptr);
    }
    buffer
}

fn jpeg() -> image::ImageResult<image::DynamicImage> {
    let jpeg_bytes = save_data(3 * 640 * 480, jpeg_);
    iio::Reader::with_format(
            io::Cursor::new(jpeg_bytes),
            image::ImageFormat::Jpeg,
        )
        .decode()
}

fn local_file() -> image::ImageResult<image::DynamicImage> {
//    let jpeg_bytes = std::fs::read("fakeWebcam.jpeg").unwrap();
//    iio::Reader::with_format(
//            io::Cursor::new(jpeg_bytes),
//            image::ImageFormat::Jpeg,
//        )
//        .decode()
    image::open("fakeWebcam.jpeg")
}

#[no_mangle]
pub fn index() -> i32 {
    if let Err(_e) = std::fs::copy("deploy-index.html", "index.html") {
        -1
    } else {
        0
    }
}

const N: usize = 64;
/// Return the RGB-pixels of square s*s representing game object o.
pub fn render(o: GameObject) -> Vec<u8> {
    let fill_color = |r,g,b| {
        let mut xs = Vec::with_capacity(3 * N * N);
        let mut i = 0;
        while i < (N * N * 3) {
            xs.push(r); xs.push(g); xs.push(b);
            i += 3;
        }
        xs
    };
    match o {
        GameObject::Apple => image::imageops::resize(
                &local_file().unwrap().into_rgb8(),
                N as u32, N as u32,
                image::imageops::FilterType::Nearest,
            ).into_vec(),
        GameObject::Body    => fill_color(0x77, 0x77, 0x77),
        GameObject::Floor   => fill_color(0xff, 0xff, 0xff),
        GameObject::Head    => fill_color(0x22, 0x22, 0x22),
        GameObject::Overlap => fill_color(0xff, 0x00, 0x00),
    }
}

const W: usize = 20;
const H: usize = 10;
const VN: usize = N * 3;
const VW: usize = W * VN;
const VIEW_SIZE: usize = (H * N) * VW;
#[no_mangle]
pub fn next_frame() -> i32 {
    // Create game TODO not in final.
    snake_adapter::new();
    let status = snake_adapter::next_frame_wasm32_wasi();
    if status != 0 { println!("failed {}", status); return 1; }

    let game_state = std::fs::read(snake_adapter::OUT_FILE).unwrap();

    // Render the game state including the apple image into the view.
    let mut blocks = Vec::with_capacity(W * H);
    for object_code in game_state.iter().take(W * H) {
        let go = (*object_code).into();
        let block = render(go);
        assert_eq!(block.len(), N * VN);
        blocks.push(block);
    }

    // Position the elements' squares into a grid.
    let mut view = [255; VIEW_SIZE];
    
    for yi in 0..H {
        for xi in 0..W {
            let block = &blocks[yi * W + xi];
            let block_top_left = yi * VW * N + xi * VN;
            // Top to bottom.
            for i in 0..N {
                // Left to right.
                let mut j = 0;
                while j < VN {
                    view[block_top_left + VW * i + j + 0] = block[i * VN + j + 0];
                    view[block_top_left + VW * i + j + 1] = block[i * VN + j + 1];
                    view[block_top_left + VW * i + j + 2] = block[i * VN + j + 2];
                    j += 3;
                }
            }
        }
    }

    // Create and save the output image to file.
    image::ImageBuffer::<image::Rgb<u8>, _>::from_vec(
        (W * N) as u32, (H * N) as u32,
        view.to_vec(),
    ).expect("bad img")
        .save("outimga.jpeg")
        .expect("cant save");
    1
}
