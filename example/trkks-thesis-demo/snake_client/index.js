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

//const CAMERA_API = {
//    get: { path: "./modules/camera/scaled", method: "GET" },
//}

// Flag for running the game in debug mode.
let debugging = true;

// Flag for pausing the game.
let paused = false;

// Video that will be sampled for the apple's pattern.
let video = null;

// The game running
let gameLoopInterval = null;

async function updateView(ctx, snakeStateUrl) {
    const response = await fetch(snakeStateUrl);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();

    // TODO: Change hardcode to wasm.exports.new(w, h);
    const { W, H } = { W: 20, H: 10 };
    const mem = new Uint8Array(
        buffer, 0, W * H + 1
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

    if (paused) {
        ctx.fillStyle = "white";
        ctx.font      = "20px mono";
        ctx.textAlign = "left";
        ctx.fillText("PAUSED", 20, 20);
    }
}


/*
 * Helper that queries for results from supervisor.
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
    if (!video) {
        // Return some default if the video has not initialized yet.
        return "green";
    }
    const imageToScale = video;
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
    gameOver(ctx);

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

function gameOver(ctx) {
    // Stop the running game.
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;

    // Show that the game has ended.
    console.log("Game over.");
    ctx.fillStyle = "red";
    ctx.font      = "20px mono";
    ctx.textAlign = "left";
    ctx.fillText(`GAME OVER (Press R to restart)`, 20, 20);
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
    updateView(ctx, files[0]);
    if (gameOverCode !== 0) {
        gameOver(ctx);
    }
}

function gameLoop(ctx) {
    if (!paused) {
        gameUpdate(ctx);
    }
}

async function restartGame(ctx, dowait=true) {
    // Make sure the earlier instance is ended.
    if (gameLoopInterval) {
        gameOver(ctx);
    }

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

async function initWebcamCapture() {
    video = document.createElement("video");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    video.play();
}

// Initialize first game.
window.onload = async () => {
    const ctx = await init(document.getElementById("canvas"));

    initKeyDownControl(ctx);

    await initWebcamCapture();

    // User has to start the game by hitting 'r'.
    //await restartGame(ctx);
};

