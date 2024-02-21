# README: Run from project root (i.e., wasmiot-orchestrator/).
#
# This script expects there to be at least two devices available with WASI
# interfaces that can be used to migrate a module back and forth.

if [ $# -lt 1 ]; then
    echo "ARG1: name of first device required"
    exit 1
elif [ $# -lt 2 ]; then 
    echo "ARG2: name of second device required"
    exit 1
elif [ $# -lt 3 ]; then 
    echo "ARG3: (for consistency) some filepath for module description required"
    exit 1
fi

DEV1=$1
DEV2=$2
MODULE_DEPLOY_FILE_NOOP=$3

function orcli() {
    npm run client -- "$@"
}

# Exit on error.
set -e

# Refresh devices.
orcli device rm
orcli device scan

# Create module.
TEST_DATA_ROOT=client/testData/wasm
MODULE_NAME=test_abc
orcli module rm $MODULE_NAME
orcli module create $MODULE_NAME $TEST_DATA_ROOT/target/wasm32-wasi/release/abc.wasm
orcli module desc $MODULE_NAME $TEST_DATA_ROOT/abc/description.json -m deployFile -p $MODULE_DEPLOY_FILE_NOOP

# Create deployment.
DEPLOYMENT_NAME=test_migrate_c_env
orcli deployment rm $DEPLOYMENT_NAME
orcli deployment create $DEPLOYMENT_NAME \
  --main $MODULE_NAME --start c_env \
  -d $DEV1 -m $MODULE_NAME -f _ \
  -d $DEV2 -m $MODULE_NAME -f _

# Deploy.
orcli deployment deploy $DEPLOYMENT_NAME

# Execute.
orcli execute $DEPLOYMENT_NAME

echo The execution result following above URL should contain name of $DEV1

function migrate() {
    # TODO: Add migration command to orcli.
    curl http://localhost:3000/migrate/$DEPLOYMENT_NAME/$MODULE_NAME -X POST
    echo See above for results of migration.
}

migrate

orcli execute $DEPLOYMENT_NAME
echo Now the execution result following above URL should contain name of $DEV2

migrate

orcli execute $DEPLOYMENT_NAME
echo Once again the execution result following above URL should contain name of $DEV1.

echo DONE! This has demonstrated module migration between devices.
