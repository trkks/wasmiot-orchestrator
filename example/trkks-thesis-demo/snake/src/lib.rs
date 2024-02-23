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
            snake::GameObject::Food    => 0,
            snake::GameObject::Body    => 1,
            snake::GameObject::Floor   => 2,
            snake::GameObject::Head    => 3,
            snake::GameObject::Overlap => 4,
        }
    }
}

impl From<&u8> for snake::GameObject {
    fn from(n: &u8) -> Self {
        match n {
            0 => snake::GameObject::Food,
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

    pub struct SnakeGameData {
        pub food_just_picked_up: bool,
        pub width: u8,
        pub height: u8,
        pub board: Vec<snake::GameObject>,

    }
    static mut FIRST_FRAME: bool = true;

    /// Serialize the game in the __STATIC VARIABLE__ into bytes.
    fn serialize_game() -> (Result<snake::GameObject, String>, Vec<u8>) {
        let game_status;
        let width;
        let height;
        let lines;
        let serialized_size;
        unsafe {
            width = W;
            height = H;
            game_status = GAME.as_mut().unwrap().next_frame(FIRST_FRAME);
            lines = GAME.as_mut().unwrap().board().chunks(width);
            serialized_size = SERIALIZED_SIZE;
        }

        let mut xs = Vec::with_capacity(serialized_size);

        // SERIALIZE_1.
        // Add information to the about the food changing: 0 at means the food has not been picked
        // up and any other value means it has.
        if let Ok(snake::GameObject::Food) = game_status {
            xs.push(1);
        } else {
            xs.push(0);
        }

        // SERIALIZE_2.
        xs.push(width as u8);
        // SERIALIZE_3.
        xs.push(height as u8);

        // SERIALIZE_4.
        for line in lines {
            xs.extend(
                &line.iter()
                    .map(|x| x.clone().into())
                    .collect::<Vec<u8>>()
            );
        }

        assert_eq!(xs.len(), serialized_size);

        (game_status, xs)
    }


    /// Interpret the bytes representing game state into an object.
    pub fn deserialize(game_state: &[u8]) -> Result<SnakeGameData, String> {
        let mut game_state = game_state.iter();

        // DE-SERIALIZE_1.
        let food_just_picked_up = *game_state.next()
            .ok_or("no food-pickup -flag in serialized game state".to_owned())?
             != 0;

        // DE-SERIALIZE_2.
        let width = *game_state.next()
            .ok_or("serialized game state is empty")?;
        // DE-SERIALIZE_3.
        let height = *game_state.next()
            .ok_or("no board height in serialized game state".to_owned())?;

        let board_size = width as usize * height as usize;
        // DE-SERIALIZE_4.
        let board = game_state.take(board_size)
            .map(snake::GameObject::from)
            .collect::<Vec<snake::GameObject>>();
        if board.len() != board_size {
            return Err(format!(
                "serialized game state not large enough for {}x{} board",
                width, height,
            ));
        }

        Ok(SnakeGameData { food_just_picked_up, width, height, board })
    }

    pub const OUT_FILE: &str = "serialized-state";
    pub static mut W: usize = 0;
    pub static mut H: usize = 0;
    static mut GAME: Option<snake::SnakeGame> = None;
    pub static mut SERIALIZED_SIZE: usize = 0;
    #[no_mangle]
    pub fn new(width: usize, height: usize) {
        unsafe {
            // Width and height need to be serializable to u8.
            assert!(W <= u8::MAX as usize);
            assert!(H <= u8::MAX as usize);
            // Hacky initialization of "constants", but enough for this demo.
            W = width;
            H = height;
            SERIALIZED_SIZE = H * W + 3;
            GAME = Some(snake::SnakeGame::new(W, H));
            // NOTE HARDCODED FOR DEMO:
            FIRST_FRAME = true;
        }
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

        let (game_status, bytes) = serialize_game();
        // TODO HARDCODED FOR DEMO:
        unsafe {
            FIRST_FRAME = false;
        }

        if 0 < unsafe { save_serialized(bytes.as_ptr()) } {
            return 3;
        }

        if let Err(_e) = game_status {
            return 2;
        }

        return 0;
    }
}
