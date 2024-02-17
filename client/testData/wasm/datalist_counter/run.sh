# README: Run from project root (i.e., wasmiot-orchestrator/).

function dorcli() {
    npm run client -- "$@"
}

# Exit on error.
set -e

# Refresh devices.
dorcli device rm
dorcli device scan

# Create module.
TEST_DATA_ROOT=client/testData/wasm
MODULE_NAME=test_datalist_counter
dorcli module rm $MODULE_NAME
dorcli module create $MODULE_NAME $TEST_DATA_ROOT/target/wasm32-wasi/release/datalist_counter.wasm
dorcli module desc $MODULE_NAME $TEST_DATA_ROOT/datalist_counter/description.json

# Create deployment.
DEPLOYMENT_NAME=test_datalist_counterd
dorcli deployment rm $DEPLOYMENT_NAME
dorcli deployment create $DEPLOYMENT_NAME \
  --main $MODULE_NAME --start counter \
  -d _ -m $MODULE_NAME  -f _ \
  -d _ -m core:Datalist -f _

# Deploy.
dorcli deployment deploy $DEPLOYMENT_NAME

# Execute.
dorcli execute $DEPLOYMENT_NAME

echo DONE! See the above URL for execution results.
