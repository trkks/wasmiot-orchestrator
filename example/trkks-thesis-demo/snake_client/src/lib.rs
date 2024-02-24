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

/// Render a triangle pointing along the x-axis (i.e., right).
fn x_axis_triangle() -> Vec<u8> {
    let mut xs = Vec::with_capacity(3 * N * N);

    // Make highlight at top edge.
    const EDGE_THICKNESS: usize = 1;
    for _ in 0..N * EDGE_THICKNESS {
        xs.push(0x00); xs.push(0x00); xs.push(0x00);
    }

    let x3 = 0_i32;
    let x4 = N as i32 - 8; // Make the triangle's point a bit flatter.

    // Top half (line is top-left to middle-right.
    let x1 = 0_i32;
    let y1 = 0_i32;
    let x2 = N as i32 - 8; // Make the triangle's point a bit flatter.
    let y2 = N as i32 / 2_i32;
    for yi in EDGE_THICKNESS..(N / 2) {
        // Horizontal line
        let y3 = yi as i32;
        let y4 = yi as i32;

        // Calculate line intersection at each row (from
        // https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection).
        let px = (
                (x1*y2 - y1*x2)*(x3 - x4) - (x1 - x2)*(x3*y4 - y3*x4)
            ) / (
                (x1 - x2)*(y3 - y4) - (y1 - y2)*(x3 - x4)
        );

        for _ in 0..px {
            xs.push(0x80); xs.push(0x80); xs.push(0x80);
        }
        
        // Make a highlighted border for triangle's pointy edge.
        const BORDER_THICKNESS: i32 = 5;
        for _ in 0..BORDER_THICKNESS-2 {
            xs.push(0x00); xs.push(0x00); xs.push(0x00);
        }
        for _ in 0..2 {
            // Fade a bit into white (poor-man's antialias.)
            xs.push(0xdd); xs.push(0xdd); xs.push(0xdd);
        }

        for _ in (px + BORDER_THICKNESS)..N as i32 {
            xs.push(0xff); xs.push(0xff); xs.push(0xff);
        }
    }

    // Bottom half is the same as upper half but with rows reversed.
    xs.extend(xs.clone().chunks(N * 3).rev().flatten());

    // Make highlight at right vertical.
    let mut i = 0;
    while i < ((N-1) * N * 3) {
        if (i + 3) % (N * 3) == 0 {
            xs[i] = 0x00; xs[i+1] = 0x00; xs[i+2] = 0x00;
        }
        i += 3;
    }

    xs
}

const fn fill_color(r: u8, g :u8, b: u8) -> [u8; 12288] {
    let mut xs = [0; 3 * N * N];
    let mut i = 0;

    // Make highlight at top edge.
    while i < (N * 3) {
        xs[i] = 0x00; xs[i+1] = 0x00; xs[i+2] = 0x00;
        i += 3;
    }

    while i < ((N-1) * N * 3) {
        // Make highlight at vertical edges.
        let is_row_start = i % (N * 3) == 0;
        let is_row_end   = (i + 3) % (N * 3) == 0;
        // NOTE HARDCODED FOR DEMO.
        // Check if this is body as to blend into head on the right.
        let is_body_part = r == 0x80;
        if  is_row_start || (is_row_end && !is_body_part) {
            xs[i] = 0x00; xs[i+1] = 0x00; xs[i+2] = 0x00;
        } else {
            xs[i] = r; xs[i+1] = g; xs[i+2] = b;
        }
        i += 3;
    }

    xs
}

/// Put the pixel RGB-values of JPEG image into a grid.
fn jpeg_pixels(jpeg_bytes: &[u8]) -> Vec<u8> {
    let img = iio::Reader::with_format(
            io::Cursor::new(jpeg_bytes),
            image::ImageFormat::Jpeg,
        )
        .decode()
        .expect("failed decoding JPEG image of RPC result");

    let mut xs = img.into_rgb8()
        .pixels()
        .map(|p| p.to_rgb().0)
        .flatten()
        .collect::<Vec<u8>>();
    assert_eq!(xs.len(), N * N * 3);

    // Make highlight at top edge.
    let mut i = 0;
    while i < (N * 3) {
        xs[i] = 0x00; xs[i+1] = 0x00; xs[i+2] = 0x00;
        i += 3;
    }
    // Make highlight at vertical edges.
    let mut i = 0;
    while i < ((N-1) * N * 3) {
        // Make highlight at vertical edges.
        if i % (N * 3) == 0 || (i + 3) % (N * 3) == 0 {
            xs[i] = 0x00; xs[i+1] = 0x00; xs[i+2] = 0x00;
        }
        i += 3;
    }

    // Make highlight at bottom edge.
    let mut i = (N - 1) * N * 3;
    while i < (N * N * 3) {
        xs[i] = 0x00; xs[i+1] = 0x00; xs[i+2] = 0x00;
        i += 3;
    }

    xs
}

/// Return the RGB-pixels of NxN cell representing game object o.
pub fn render(o: GameObject, scaled_jpeg_bytes: &[u8]) -> Vec<u8> {
    match o {
        GameObject::Food    => jpeg_pixels(scaled_jpeg_bytes),
        GameObject::Body    => fill_color(0x80, 0x80, 0x80).to_vec(),
        GameObject::Floor   => fill_color(0xff, 0xff, 0xff).to_vec(),
        GameObject::Head    => x_axis_triangle(),
        GameObject::Overlap => fill_color(0xff, 0x00, 0x00).to_vec(),
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
