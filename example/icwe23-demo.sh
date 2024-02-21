# This script demonstrates the whole set and execution of the ICWE23 demo
# scenario using the orchestrator CLI client (instead of web-GUI).
#
# The WebAssembly modules tested with are found in wasmiot-modules repo commit
# 6ade03d11d71c001bd839929a445db77417ad8f3 .
#
# NOTE: This script is supposed to run from project root, NOT e.g. from the
# example/ dir.
#
# NOTENOTE: Read the fine source code before you run it! For example this script
# makes HTTP-requests with curl but no guarantees of possible security
# implications are made.

if [ $# -lt 1 ]; then
    echo "ARG1: path to a .wasm file of camera required"
    exit 1
elif [ $# -lt 2 ]; then 
    echo "ARG2: path to a .json file of camera description required"
    exit 1
elif [ $# -lt 3 ]; then 
    echo "ARG3: path to a .wasm file of inference required"
    exit 1
elif [ $# -lt 4 ]; then 
    echo "ARG4: path to a .json file of inference description required"
    exit 1
elif [ $# -lt 5 ]; then 
    echo "ARG5: path to a compatible model file for inference required"
    exit 1
fi

# Define variables for the file paths.
campath=$(readlink -f $1)
camdescpath=$(readlink -f $2)
infpath=$(readlink -f $3)
infdescpath=$(readlink -f $4)
infmodelpath=$(readlink -f $5)

campathcontainer=/app/modules/cam.wasm
camdescpathcontainer=/app/modules/cam.json
infpathcontainer=/app/modules/inf.wasm
infdescpathcontainer=/app/modules/inf.json
infmodelpathcontainer=/app/modules/inf.model

set -e

examplecomposepath=example/docker-compose.icwe23-demo.yml

# Start containers to have interaction in the system.
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose -f $examplecomposepath up --build --detach

# Use the client container.
clientcontainername="wasmiot-orcli"
docker build -t $clientcontainername -f client.Dockerfile .

servercontainername="icwe23-demo-orchestrator"
dockernetworkname="icwe23-demo-wasmiot-net"

cleanup() {
    echo "Example has finished. Composing down..."
    docker-compose -f $examplecomposepath down
    echo "Done."
    exit 0
}

docker run \
    --rm \
    --env ORCHESTRATOR_ADDRESS=http://${servercontainername}:3000 \
    --network=$dockernetworkname \
    --volume=$campath:$campathcontainer:ro \
    --volume=$camdescpath:$camdescpathcontainer:ro \
    --volume=$infpath:$infpathcontainer:ro \
    --volume=$infdescpath:$infdescpathcontainer:ro \
    --volume=$infmodelpath:$infmodelpathcontainer:ro \
    --volume=./example/icwe23-run.sh:/app/run.sh \
    $clientcontainername \
    "chmod u+x /app/run.sh && /app/run.sh $campathcontainer $camdescpathcontainer $infpathcontainer $infdescpathcontainer $infmodelpathcontainer" \
    && cleanup

printf "\n!!!\nDemonstration failed!\n* You could try increasing the wait time by passing it as ARG6.\n* NOTE that the containers are left unremoved for you to inspect their logs!\n\n"
exit 1
