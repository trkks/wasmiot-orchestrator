// Constants for game area.
const CELLBOUNDS = [20, 10];
const CELLSIZE = [64, 64];
const BOUNDS = [CELLBOUNDS[0] * CELLSIZE[0], CELLBOUNDS[1] * CELLSIZE[1]];
// Constants for game timing.
const WAIT_READY = 0;//3000;
const GAME_TICK = 150;

// Path where the .wasm containing game logic can be loaded from.
const GAME_WASM_PATH = "snake.wasm";

// Video that will be sampled for the apple's pattern.
let video = null;

// The game running
let wasmInstanceMemory = null;
let gameLoopInterval = null;

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

    // Do some example drawing.
    ctx.fillStyle = "green";
    ctx.fillRect(10, 10, 150, 100);

    // Set initial apple pattern.
    applePattern = await getApplePattern(ctx, ...CELLSIZE);

    // Load and start the WebAssembly app importing functionality
    // of the canvas.
    const importObject = {
        javascript: {
            // NOTE: Passing async function to WebAssembly which makes no
            // distinction between async and sync callbacks.
            saveSerializedState: async function(ptr) {
                // TODO: Change hardcode to wasm.exports.new(w, h);
                const { W, H } = { W: 20, H: 10 };
                const mem = new Uint8Array(
                    wasmInstanceMemory.buffer, ptr, W * H + 1
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
        },
        utils: {
            randomFloat: () => Math.random()
        }
    };

    const results = await WebAssembly.instantiateStreaming(
        fetch(GAME_WASM_PATH), importObject
    );
    const wasm = results.instance;
    wasmInstanceMemory = wasm.exports.memory;

    return { ctx, wasm };
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
    ctx.fillStyle = "white";
    ctx.font      = "20px mono";
    ctx.textAlign = "left";
    ctx.fillText(`GAME OVER (Press R to restart)`, 20, 20);
}

/*
* Add __global__ keyboard controls.
*/
function initKeyDownControl(ctx, wasm) {
    document.addEventListener("keydown",
        function(e) {
            if (e.key === "r") {
                restartGame(ctx, wasm, false);
                return;
            }

            if (!gameLoopInterval) {
                return;
            }
            
            let code = 4;
            switch (e.key) {
                case "ArrowUp"   : code = 0; break;
                case "ArrowDown" : code = 1; break;
                case "ArrowLeft" : code = 2; break;
                case "ArrowRight": code = 3; break;
            }

            // Game observes this input.
            wasm.exports.set_input(code);
        }
    );
}

function restartGame(ctx, wasm, dowait=true) {
    // Make sure the earlier instance is ended.
    if (gameLoopInterval) {
        gameOver(ctx);
    }

    // Initialize the game.
    wasm.exports.new();

    // Wait for some time before starting the game loop so that player
    // can prepare.
    const startLoop = function() {
        // Start game loop.
        gameLoopInterval = setInterval(
            () => {
                if (wasm.exports.next_frame_wasm32_unknown_unknown() !== 0) {
                    gameOver(ctx);
                }
            },
            GAME_TICK
        );
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
    const { ctx, wasm } = await init(document.getElementById("canvas"));

    initKeyDownControl(ctx, wasm);

    await initWebcamCapture();

    restartGame(ctx, wasm);
};

