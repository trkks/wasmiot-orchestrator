/* Time in ms to give the user to get ready at startup */
const WAIT_READY = 0;//3000;
/* Time in ms between fetching game frames */
const GAME_TICK = 750;

/* Size of canvas (and game view) */
const SCREEN_SIZE = [64 * 20, 64 * 10];
/* Origin of UI-messages */
const MESSAGE_COORS = [20, 20];

/* Paths where the .wasm containing game logic can be queried from */
const SNAKE_GAME_API = {
    init:  {                   path: "modules/snake/new",                    method: "POST" },
    next:  { action: "stream", path: "modules/snake_client/next_frame",                     },
    input: {                   path: "modules/snake/set_input",              method: "POST" },
};

/* Paths for migrating modules currently placed at origin */
const MIGRATION_API = {
    camera: { action: "migrate", path: "camera" },
}

/*
 * Helper that queries for results from supervisor.
 *
 * Include your arguments to (WebAssembly) function execution after the
 * apiCommand parameter.
 */
async function executeSupervisor(apiCommand) {
    const args = Array.prototype.slice.call(arguments, 1);
    const argStrings = args.map((x, i) => `param${i}=${x}`);
    const queryString = `?${argStrings.join("&")}`

    let method = "GET";
    let actionPrefix = "";
    switch (apiCommand.action) {
        case "migrate": 
            method = "POST";
            actionPrefix = "migrate/";
            break;
        case "stream": 
            throw "when streaming data, implement specially made handlers instead";
    }

    const r1 = await fetch(
        "./" + actionPrefix + apiCommand.path + queryString,
        { method }
    );

    const json1 = await r1.json();

    if (!r1.ok) {
        console.error(r1);
        throw `request '${apiCommand}' failed`;
    }

    if (json1.resultUrl) {
        const r2 = await fetch(json1.resultUrl);
        const json2 = await r2.json();

        if (!json2.success) {
            const message = `API execution error on '${JSON.stringify(apiCommand)}'`;
            console.error(message, json2);
            throw message;
        }

        // TODO: generalize
        // Only return GET results.
        if (apiCommand.method === "GET") {
            console.log("Result:", json2.result);
            return json2.result;
        }
    }
}

/* Flag that shows if game is paused */
let paused = true;

/* Flag that shows if game is over */
let gameIsOver = true;

/* Timer that updates the game */
let gameLoopInterval = null;

function gameOver() {
    // Stop the running game.
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
    gameIsOver = true;
}

var bitmap;
async function updateView(ctx, stateUpdate) {
    // Clear screen.
    ctx.clearRect(0,0, ...SCREEN_SIZE);
    
    // Game state at bottom.
    if (stateUpdate) {
        // Only create the bitmap when needed.
        bitmap = await createImageBitmap(stateUpdate);
    }
    ctx.drawImage(bitmap, 0, 0, ...SCREEN_SIZE);

    // "UI" on top.
    let coors = Array.from(MESSAGE_COORS);
    if (paused) {
        ctx.fillStyle = "black";
        ctx.font      = "20px mono";
        ctx.textAlign = "left";
        ctx.fillText("PAUSED", ...coors);
        // Lower the next message so they are not overlapping.
        coors[1] += 20;
    }

    if (gameIsOver) {
        // Show that the game has ended.
        console.log("Game over.");
        ctx.fillStyle = "red";
        ctx.font      = "20px mono";
        ctx.textAlign = "left";
        ctx.fillText(`GAME OVER (Press R to restart)`, ...coors);
    }
}

/*
 * Get blob of the next image frame of the game.
 */
async function updateGame(ctx) {
    console.log("-- tick --");
    
    const response = await fetch(
        SNAKE_GAME_API.next.action + "/" + SNAKE_GAME_API.next.path
    );

    let chunks = [];
    console.log("Collecting stream...");
    for await (const chunk of response.body) {
        console.log("Chunk:", chunk);
        chunks.push(chunk);
    }
    console.log("Stream has ended with:", chunks);

    // Throw if game is over.
    if (chunks[0][0] !== 0) {
        throw `game over code: ${chunks[0][0]}`;
    }

    // Pick out the part where game over code is stored.
    chunks[0] = chunks[0].slice(1);

    // Return the part that contains the JPEG image.
    return new Blob(chunks);
}

async function init(canvas) {
    const ctx = canvas.getContext("2d");
    canvas.width  = SCREEN_SIZE[0];
    canvas.height = SCREEN_SIZE[1];

    // Show starting screen.
    gameOver();
    updateView(ctx);

    return ctx;
}

var imgBlob;
/*
 * Update view based on game state. Return false if game state update fails.
 */
async function gameLoop(ctx) {
    if (!paused) {
        try {
            imgBlob = await updateGame(ctx);
        } catch (e) {
            console.log(e);
            gameOver();
            return false;
        }
    }
    await updateView(ctx, imgBlob);
    return true;
}

async function restartGame(ctx, dowait=true) {
    // Make sure the earlier instance is ended.
    if (gameLoopInterval) {
        gameOver();
    }

    gameIsOver = false;

    // Initialize the game at server.
    await executeSupervisor(SNAKE_GAME_API.init);

    // Wait for some time before starting the game loop so that player
    // can prepare.
    const startLoop = function() {
        // Start game loop that TODO runs every time the game state update succeeds.
        gameLoopInterval = setInterval(() => gameLoop(ctx), GAME_TICK);
    };
    if (dowait) {
        setTimeout(startLoop, WAIT_READY);
    } else {
        startLoop();
    }
}

/*
 * Add keyboard controls.
 */
function initKeyDownControl(ctx) {
    document.addEventListener("keydown",
        async function(e) {
            let code = null;
            // Control the running game.
            switch (e.key) {
                case "ArrowUp"   : code = 0; break;
                case "ArrowDown" : code = 1; break;
                case "ArrowLeft" : code = 2; break;
                case "ArrowRight": code = 3; break;
            }
            if (code !== null) {
                // Game observes this input.
                executeSupervisor(SNAKE_GAME_API.input, code);
                return;
            }

            // Control the application.
            switch (e.key) {
                case "j":
                    // Allow manually "ticking" the game forward.
                    imgBlob = await updateGame(ctx);
                    break;
                case "m":
                    // Allow changing the camera source.
                    executeSupervisor(MIGRATION_API.camera);
                    break;
                case "p":
                    paused = !paused;
                    break;
                case "r":
                    await restartGame(ctx, false);
                    break;
            }

        }
    );
}

window.onload = async () => {
    const ctx = await init(document.getElementById("canvas"));
    initKeyDownControl(ctx);
    // Start game as paused.
    paused = true;
};

