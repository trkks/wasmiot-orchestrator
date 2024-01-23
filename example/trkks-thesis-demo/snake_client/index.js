// Constants for game area.
const CELLBOUNDS = [20, 10];
const CELLSIZE = [64, 64];
const BOUNDS = [CELLBOUNDS[0] * CELLSIZE[0], CELLBOUNDS[1] * CELLSIZE[1]];
// Constants for game timing.
const WAIT_READY = 0;//3000;
const GAME_TICK = 750;

// Path where the .wasm containing game logic can be queried from.
const SNAKE_GAME_API = {
    init:  { path: "./modules/snake/new",                    method: "POST" },
    next:  { path: "./modules/snake/next_frame_wasm32_wasi", method: "GET"  },
    input: { path: "./modules/snake/set_input",              method: "POST" },
};

const CAMERA_API = {
    get: { path: "./modules/camera/scaled", method: "GET" },
}

const MIGRATION_API = {
    camera: { path: "./migrate/camera", method: "POST" },
}

// Flag for running the game in debug mode.
let debugging = true;

// Flag for pausing the game.
let paused = false;

// Flag for game over.
let gameIsOver = true;

// The game running
let gameLoopInterval = null;

// Current serialized game state.
let stateBuffer;

// The visual for apple pickup.
let applePattern;

async function updateView(ctx) {
    if (stateBuffer) {
        // TODO: Change hardcode to wasm.exports.new(w, h);
        const { W, H } = { W: 20, H: 10 };
        const mem = new Uint8Array(
            stateBuffer, 0, W * H + 1
        );
        const state = mem.slice(0, W * H + 1);
        // Show the state onscreen. 
        fillGrid(ctx, -1);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const thing = state[y * W + x];
                drawAtGrid(ctx, x, y, thing);
            }
        }
        // Set a new image as the apple pattern if the apple-spawn-flag
        // is set.
        if (state.at(-1) !== 0) {
            applePattern = await getApplePattern(ctx, ...CELLSIZE);
        }
    }

    if (paused) {
        ctx.fillStyle = "white";
        ctx.font      = "20px mono";
        ctx.textAlign = "left";
        ctx.fillText("PAUSED", 20, 20);
    }

    if (gameIsOver) {
        // Show that the game has ended.
        console.log("Game over.");
        ctx.fillStyle = "red";
        ctx.font      = "20px mono";
        ctx.textAlign = "left";
        ctx.fillText(`GAME OVER (Press R to restart)`, 20, 20);
    }
}


/*
 * Helper that queries for results from supervisor.
 *
 * Include your arguments to (WebAssembly) function execution after the
 * apiCommand parameter.
 **/
async function executeSupervisor(apiCommand) {
    const args = Array.prototype.slice.call(arguments, 1);
    const argStrings = args.map((x, i) => `param${i}=${x}`);
    const queryString = `?${argStrings.join("&")}`
    const r1 = await fetch(
        apiCommand.path + queryString,
        { method: apiCommand.method }
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
 
function initCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    canvas.width = BOUNDS[0];
    canvas.height = BOUNDS[1];

    return ctx;
}

/*
 * Return a pattern for the game's apple object scaled as requested.
 */
async function getApplePattern(ctx, scaleWidth, scaleHeight) {
    const [_, files] = await executeSupervisor(CAMERA_API.get, 6, 9);
    const imageResp = await fetch(files[0]);
    const imageBlob = await imageResp.blob();
    const imageToScale = await createImageBitmap(imageBlob);
    // Scale the image.
    const scalingCanvas = document.createElement("canvas");
    // Set the canvas to be the same size as the eventual image in order to
    // have more straightforward operations below.
    scalingCanvas.width = scaleWidth;
    scalingCanvas.height = scaleHeight;
    const scalingCtx = scalingCanvas.getContext("2d");
    scalingCtx.drawImage(imageToScale, 0, 0, scaleWidth, scaleHeight);
    // Create a pattern from the scaled image on the canvas.
    const pattern = ctx.createPattern(scalingCanvas, "repeat");

    return pattern;
}

async function init(canvas) {
    const ctx = initCanvas(canvas);

    // Show starting screen.
    gameOver();
    updateView(ctx);

    // Set initial apple pattern.
    applePattern = await getApplePattern(ctx, ...CELLSIZE);

    return ctx;
}

/*
* Set current fillstyle based on thing.
*/
function setFillStyleOnTing(ctx, thing) {
    switch (thing) {
        case 0:
            ctx.fillStyle = applePattern;
            break;
        case 1:
            ctx.fillStyle = "blue";
            break;
        case 2:
            ctx.fillStyle = "black";
            break;
        case 3:
            ctx.fillStyle = "lightBlue";
            break;
        case 4:
            ctx.fillStyle = "red";
            break;
        default:
            ctx.fillStyle = "pink";
            break;
    }
}

/*
* Draw the thing at the grid coordinate.
*/
function drawAtGrid(ctx, x, y, thing) {
    setFillStyleOnTing(ctx, thing);

    ctx.fillRect(
        x * CELLSIZE[0],
        y * CELLSIZE[1],
        CELLSIZE[0],
        CELLSIZE[1]
    );
}

/*
* Clear the canvas.
*/
function fillGrid(ctx, thing) {
    setFillStyleOnTing(ctx, thing);
    for (let y = 0; y < CELLBOUNDS[1]; y++) {
        for (let x = 0; x < CELLBOUNDS[0]; x++) {
            drawAtGrid(ctx, x, y);
        }
    }
}

function gameOver() {
    // Stop the running game.
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
    gameIsOver = true;
}

/*
* Add __global__ keyboard controls.
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
                case "d":
                    debugging = !debugging;
                    break;
                case "j":
                    // Allow manually "ticking" the game forward.
                    await gameUpdate(ctx);
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

/*
 * Update the game one step forward.
 **/
async function gameUpdate(ctx) {
    console.log("-- tick --");
    const [gameOverCode, files] = await executeSupervisor(SNAKE_GAME_API.next);
    const response = await fetch(files[0]);
    const blob = await response.blob();
    stateBuffer = await blob.arrayBuffer();

    if (gameOverCode !== 0) {
        gameOver();
    }
}

async function gameLoop(ctx) {
    if (!paused) {
        await gameUpdate(ctx);
    }
    await updateView(ctx);
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
        // Start game loop.
        gameLoopInterval = setInterval(() => gameLoop(ctx), GAME_TICK);
    };
    if (dowait) {
        setTimeout(startLoop, WAIT_READY);
    } else {
        startLoop();
    }
}

// Initialize first game.
window.onload = async () => {
    const ctx = await init(document.getElementById("canvas"));

    initKeyDownControl(ctx);

    // User has to start the game by hitting 'r'.
    //await restartGame(ctx);
};

