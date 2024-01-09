pub mod snake_adapter {
    use super::snake;

    #[link(wasm_import_module="javascript")]
    extern {
        #[link_name="saveSerializedState"]
        fn unknown_unknown_save_serialized_state(ptr: *const u8) -> u32;
    }

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

    impl From<super::snake::GameObject> for u8 {
        fn from(go: super::snake::GameObject) -> Self {
            match go {
                
               super::snake::GameObject::Apple   => 0,
               super::snake::GameObject::Body    => 1,
               super::snake::GameObject::Floor   => 2,
               super::snake::GameObject::Head    => 3,
               super::snake::GameObject::Overlap => 4,
            }
        }
    }

    const OUT_FILE: &str = "serializedSnake.json";
    const W: usize = 20;
    const H: usize = 10;
    static mut GAME: Option<snake::SnakeGame> = None;

    #[no_mangle]
    pub fn new() {
        unsafe { GAME = Some(snake::SnakeGame::new(W, H)); }
    }

    #[no_mangle]
    pub unsafe fn set_input(input: u8) {
        GAME.as_mut().unwrap().set_input(input.into()); 
    }

    #[no_mangle]
    pub fn next_frame_wasm32_unknown_unknown() -> u32 {
        next_frame(unknown_unknown_save_serialized_state)
    }

    #[no_mangle]
    pub fn next_frame_wasm32_wasi() -> u32 {
        unsafe extern fn f(ptr: *const u8) -> u32 {
            let x = unsafe { std::slice::from_raw_parts(ptr, W * H) };
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
    pub fn next_frame(save_serialized_barbar: unsafe extern fn(*const u8) -> u32) -> u32 {
        let game_status = unsafe { GAME.as_mut().unwrap().next_frame() };

        let lines = unsafe { GAME.as_mut().unwrap().board().chunks(W) };

        // Write the game-matrix flat into a file where each byte matches a cell.
        let bytes: Vec<u8> = {
            let mut xs = lines
                .fold(
                    Vec::with_capacity(W * H),
                    |mut acc, line| {
                        acc.extend(
                            &line.iter()
                                .map(|x| <snake::GameObject as Into<u8>>::into(x.clone()))
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

        assert_eq!(bytes.len(), W * H + 1);
        

        if 0 < unsafe { save_serialized_barbar(bytes.as_ptr()) }{
            return 3;
        }

        if let Err(_e) = game_status {
            return 2;
        }

        return 0;
    }
}

mod snake;

mod rand {
    #[link(wasm_import_module="utils")]
    extern {
        #[link_name = "randomFloat"]
        fn extern_random() -> f32;
    }

    pub fn random<T>() -> f32 {
        let a = unsafe { extern_random() };
        a.clamp(0., 1.)
    }
}
