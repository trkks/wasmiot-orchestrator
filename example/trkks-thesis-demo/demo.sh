# This script demonstrates the setup and execution of trkks' thesis' scenario.
# User action is required for using the application with a web browser.
#
# NOTE: This script is supposed to run from project root, NOT e.g. from the
# example/ dir.
#
# NOTENOTE: Read the fine source code before you run it!

if ! command -v python3; then
    echo "'python3' is required to run this script"
    exit 1
fi

if ! command -v cargo; then
    echo "'cargo' is required to run this script"
    exit 1
fi

set -e

wait_prompt() {
    for i in $(seq 0 $2);
    do
        printf "\r$1... (%2ds)" $(( $2 - $i ))
        sleep 1
    done
    echo ""
}

# Build the WebAssembly modules.
cd example/trkks-thesis-demo
cargo build --target wasm32-wasi --release
# Change back to project root.
cd -

# Build the client container.
clientcontainername="wasmiot-orcli"
docker build -t $clientcontainername -f client.Dockerfile .

composepath=example/trkks-thesis-demo/docker-compose.yml

# Start containers to have interaction in the system.
docker-compose -f $composepath --profile demo up --build --detach

wait_prompt "Wait a bit for orchestrator to set up" 5

servercontainername="trkks-thesis-demo-orchestrator"
dockernetworkname="trkks-thesis-demo-net"

docker run \
    --rm \
    --env ORCHESTRATOR_ADDRESS=http://${servercontainername}:3000 \
    --network=$dockernetworkname \
    --volume=./example/trkks-thesis-demo/:/app/example/trkks-thesis-demo/:ro \
    --volume=./example/trkks-thesis-demo/run.sh:/app/run.sh \
    $clientcontainername \
    "/app/run.sh primary-camera-thingi alternate-camera-thingi"

echo
echo The demo script is now done.
echo You should now be able to interact with the application.
echo
echo Also REMEMBER to:
echo \'\'\'
echo "docker-compose -f $composepath down"
echo \'\'\'
echo when you\'re finished with the demo!
