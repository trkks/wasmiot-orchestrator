use snake_client::{N, _next_frame};
use snake::snake_adapter::{SERIALIZED_SIZE, new, next_frame as next_game_state};

static mut SERIALIZED_GAME: Vec<u8> = Vec::new();

unsafe extern fn save(ptr: *const u8) -> u32 {
    let bytes = { std::slice::from_raw_parts(ptr, SERIALIZED_SIZE) };
    SERIALIZED_GAME = bytes.to_vec();
    0
}

fn main() {
    // Init game.
    new();
    // Get third game state.
    next_game_state(save);
    next_game_state(save);
    next_game_state(save);
    // Draw and save the state to file.
    let img_bytes = camera::scaled_jpeg(
        N as u32, N as u32,
        std::fs::read("fakeWebcam.jpeg").unwrap()
    );
    std::fs::write("debug.jpeg", img_bytes.clone()).expect("failed saving debug");
    let result = unsafe { _next_frame(&SERIALIZED_GAME, &img_bytes) };
    println!("Result: {}", result);
}
