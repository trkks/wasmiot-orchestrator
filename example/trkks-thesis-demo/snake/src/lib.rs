pub mod snake;

impl From<u8> for snake::Input {
    fn from(value: u8) -> Self {
        match value {
            0 => Self::Up,
            1 => Self::Down,
            2 => Self::Left,
            3 => Self::Right,
            4.. => Self::Undefined,
        }
    }
}

impl From<snake::GameObject> for u8 {
    fn from(go: snake::GameObject) -> Self {
        match go {
            snake::GameObject::Apple   => 0,
            snake::GameObject::Body    => 1,
            snake::GameObject::Floor   => 2,
            snake::GameObject::Head    => 3,
            snake::GameObject::Overlap => 4,
        }
    }
}

impl From<u8> for snake::GameObject {
    fn from(n: u8) -> Self {
        match n {
            0 => snake::GameObject::Apple,
            1 => snake::GameObject::Body,
            2 => snake::GameObject::Floor,
            3 => snake::GameObject::Head,
            4 => snake::GameObject::Overlap,
            _ => panic!("unknown game object {}", n),
        }
    }
}

pub mod snake_adapter {
    use super::snake;


    pub const OUT_FILE: &str = "serialized-state";
    const W: usize = 20;
    const H: usize = 10;
    static mut GAME: Option<snake::SnakeGame> = None;
    const SERIALIZED_SIZE: usize = H * W + 1;
    #[no_mangle]
    pub fn new() {
        unsafe { GAME = Some(snake::SnakeGame::new(W, H)); }
    }

    #[no_mangle]
    pub unsafe fn set_input(input: u8) {
        if GAME.is_some() {
            GAME.as_mut().unwrap().set_input(input.into()); 
        }
    }

    #[no_mangle]
    pub fn next_frame_wasm32_wasi() -> u32 {
        unsafe extern fn f(ptr: *const u8) -> u32 {
            let x = unsafe { std::slice::from_raw_parts(ptr, SERIALIZED_SIZE) };
            if std::fs::write(OUT_FILE, x).is_ok() {
                0
            } else {
                1
            }
        }
        next_frame(f)
    }

    /// Increment the game-state forward, serialize the state and return 0 if the game is still
    /// successfully running.
    pub fn next_frame(save_serialized: unsafe extern fn(*const u8) -> u32) -> u32 {
        if unsafe { GAME.is_none() } {
            return 4;
        }

        let game_status = unsafe { GAME.as_mut().unwrap().next_frame() };

        let lines = unsafe { GAME.as_mut().unwrap().board().chunks(W) };

        // Write the game-matrix flat into a file where each byte matches a cell.
        let bytes: Vec<u8> = {
            let mut xs = lines
                .fold(
                    Vec::with_capacity(SERIALIZED_SIZE),
                    |mut acc, line| {
                        acc.extend(
                            &line.iter()
                                .map(|x| x.clone().into())
                                .collect::<Vec<u8>>()
                        );
                        acc
                });

            // Add information to the __serialized state__ about the apple changing: 0 at the last
            // index means the apple has not been picked up and any other value means it has.
            if let Ok(snake::GameObject::Apple) = game_status {
                xs.push(1);
            } else {
                xs.push(0);
            }
            xs
        };

        assert_eq!(bytes.len(), SERIALIZED_SIZE);
        

        if 0 < unsafe { save_serialized(bytes.as_ptr()) }{
            return 3;
        }

        if let Err(_e) = game_status {
            return 2;
        }

        return 0;
    }
}
