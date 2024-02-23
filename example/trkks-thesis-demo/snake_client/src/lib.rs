use std::io;

use image::{Pixel, io as iio};

use snake::{snake_adapter::{SnakeGameData, deserialize}, snake::GameObject};


mod rpc_utils;

use rpc_utils::do_rpc;


#[no_mangle]
pub fn index() -> i32 {
    if let Err(_e) = std::fs::copy("deploy-index.html", "index.html") {
        -1
    } else {
        0
    }
}

pub const N: usize = 64;

/// Return the RGB-pixels of square s*s representing game object o.
pub fn render(o: GameObject, scaled_jpeg_bytes: &[u8]) -> Vec<u8> {
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
        GameObject::Food => {
            // Put the pixel RGB-values into a grid.
            let img = iio::Reader::with_format(
                    io::Cursor::new(scaled_jpeg_bytes),
                    image::ImageFormat::Jpeg,
                )
                .decode()
                .expect("failed decoding JPEG image of RPC result");

            let img_grid = img.into_rgb8()
                .pixels()
                .map(|p| p.to_rgb().0)
                .flatten()
                .collect::<Vec<u8>>();
            assert_eq!(img_grid.len(), N * N * 3);

            img_grid
       },
        GameObject::Body    => fill_color(0x77, 0x77, 0x77),
        GameObject::Floor   => fill_color(0xff, 0xff, 0xff),
        GameObject::Head    => fill_color(0x22, 0x22, 0x22),
        GameObject::Overlap => fill_color(0xff, 0x00, 0x00),
    }
}

const VN: usize = N * 3;
const MAX_SERIALIZED_GAME_SIZE: usize = 1024;

/// Using RPCs, generate and save the next game frame.
#[no_mangle]
pub fn next_frame() -> i32 {
    let state = {
        let Ok(game_state) = do_rpc(
            "snake", "next_frame_wasm32_wasi",
            None, MAX_SERIALIZED_GAME_SIZE,
        ) else { return 1; };

        game_state
    };

    let img = {
        // Pack the input args width and height to a buffer.
        let nbytes_args = std::iter::repeat(N.to_le_bytes())
            .take(2)
            .flatten()
            .collect();

        // TODO: An RPC every render-call might be too much...
        let Ok(scaled_jpeg_bytes) = do_rpc(
            "camera", "scaled",
            Some(nbytes_args), 4096 // Should be enough for this sized JPEG.
        ) else { return 2; };

        scaled_jpeg_bytes
    };

    _next_frame(&state, &img)
}

pub fn _next_frame(game_state: &[u8], food_image: &[u8]) -> i32 {
    let SnakeGameData { width, height, board, .. } = match deserialize(game_state) {
        Ok(x)  => x,
        Err(e) => {
            eprintln!("{}", e);
            return -1;
        }
    };
    let (width, height) = (width as usize, height as usize);
    let view_width = width * VN;
    let view_size = (height * N) * view_width;

    // Render the game state including the apple image into the view.
    let mut blocks = Vec::with_capacity(width * height);
    for game_object in board {
        let block = render(game_object, food_image);
        assert_eq!(block.len(), N * VN);
        blocks.push(block);
    }

    // Position the elements' squares into a grid.
    let mut view = vec![255; view_size];
    
    for yi in 0..height {
        for xi in 0..width {
            let block = &blocks[yi * width + xi];
            let block_top_left = yi * view_width * N + xi * VN;
            // Top to bottom.
            for i in 0..N {
                // Left to right.
                let mut j = 0;
                while j < VN {
                    view[block_top_left + view_width * i + j + 0] = block[i * VN + j + 0];
                    view[block_top_left + view_width * i + j + 1] = block[i * VN + j + 1];
                    view[block_top_left + view_width * i + j + 2] = block[i * VN + j + 2];
                    j += 3;
                }
            }
        }
    }

    // Create and save the output image to file.
    image::ImageBuffer::<image::Rgb<u8>, _>::from_vec(
        (width * N) as u32, (height * N) as u32,
        view.to_vec(),
    ).expect("bad img")
        .save("snake_game.jpeg")
        .expect("cant save");
    0
}
