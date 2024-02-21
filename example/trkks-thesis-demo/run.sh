# README: Run from project root (i.e., wasmiot-orchestrator/).

if [ $# -lt 1 ]; then
    echo "ARG1: name of initial camera device required"
    exit 1
elif [ $# -lt 2 ]; then 
    echo "ARG2: name of alternate camera device required"
    exit 1
fi

START_CAM_DEVICE=$1
ALTER_CAM_DEVICE=$2

function orcli() {
    npm run client -- "$@"
}

# Exit on error.
set -e

# Refresh devices. Assuming 3 WASI in total and 2 of them cameras.
orcli device rm
orcli device scan

# Create modules.
TEST_DATA_ROOT=example/trkks-thesis-demo

function add_module() {
    orcli module rm "$1"
    orcli module create "$1" $TEST_DATA_ROOT/target/wasm32-wasi/release/"$1".wasm
    orcli module desc "$1" $TEST_DATA_ROOT/"$1"/description.json "${@:2}"
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
orcli deployment rm $DEPLOYMENT_NAME
orcli deployment create $DEPLOYMENT_NAME \
  --main $CLIENT_MOD --start index \
  -d $START_CAM_DEVICE -m $CLIENT_MOD -f _ \
  -d $ALTER_CAM_DEVICE -m $SNAKE_MOD  -f _ \
  -d $START_CAM_DEVICE -m $CAMERA_MOD -f _ \

# Deploy.
orcli deployment deploy $DEPLOYMENT_NAME

# Execute.
orcli execute $DEPLOYMENT_NAME

echo DONE! See the above URL for execution results.
