# README: Run from project root (i.e., wasmiot-orchestrator/).

function dorcli() {
    npm run client -- "$@"
}

# Exit on error.
set -e

# Refresh devices. Assuming 3 WASI in total and 2 of them cameras.
dorcli device rm
dorcli device scan

# Create modules.
TEST_DATA_ROOT=example/trkks-thesis-demo

function add_module() {
    dorcli module rm "$1"
    dorcli module create "$1" $TEST_DATA_ROOT/target/wasm32-wasi/release/"$1".wasm
    dorcli module desc "$1" $TEST_DATA_ROOT/"$1"/description.json "${@:2}"
}

CLIENT_MOD=snake_client
SNAKE_MOD=snake
CAMERA_MOD=camera
add_module $CLIENT_MOD \
    -m deploy-index.html -p $TEST_DATA_ROOT/$CLIENT_MOD/index.html \
    -m index.js          -p $TEST_DATA_ROOT/$CLIENT_MOD/index.js
add_module $SNAKE_MOD
add_module $CAMERA_MOD

# Create deployment.
DEPLOYMENT_NAME=snaked
dorcli deployment rm $DEPLOYMENT_NAME
dorcli deployment create $DEPLOYMENT_NAME \
  --main $CLIENT_MOD --start index \
  -d _ -m $CLIENT_MOD -f _ \
  -d _ -m $SNAKE_MOD  -f _ \
  -d _ -m $CAMERA_MOD -f _ \

# Deploy.
dorcli deployment deploy $DEPLOYMENT_NAME

# Execute.
dorcli execute $DEPLOYMENT_NAME

echo DONE! See the above URL for execution results.
