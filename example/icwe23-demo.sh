# This script demonstrates the whole set and execution of the ICWE23 demo
# scenario using the orchestrator CLI client (instead of web-GUI).
#
# NOTE: This script is supposed to run from project root, NOT e.g. from the example/ dir.

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

# Printing the message $1, stop and wait for $2 seconds.
wait_prompt() {
    for i in $(seq 0 $2);
    do
        printf "\r$1... (%2ds)" $(( $2 - $i ))
        sleep 1
    done
    echo ""
}

set -e

# Start containers to have interaction in the system.
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose -f example/docker-compose.icwe23-demo.yml up --build --detach

# Use the client container.
clientcontainername="wasmiot-orcli"
docker build -t $clientcontainername -f client.Dockerfile .

servercontainername="icwe23-demo-orchestrator"
dockernetworkname="icwe23-demo-wasmiot-net"
# Inside this script, instead of using alias, define the partial docker command
# as a variable for brevity.
dorcli="docker run \
    --rm
    --env ORCHESTRATOR_ADDRESS=http://${servercontainername}:3000 \
    --network=$dockernetworkname \
    --volume=$campath:$campathcontainer:ro \
    --volume=$camdescpath:$camdescpathcontainer:ro \
    --volume=$infpath:$infpathcontainer:ro \
    --volume=$infdescpath:$infdescpathcontainer:ro \
    --volume=$infmodelpath:$infmodelpathcontainer:ro \
    $clientcontainername"

# Wait a bit before requests in order to give time for orchestrator to start.
wait_prompt "Waiting a bit until orchestrator should have started" 7

# Remove possibly conflicting resources that are there already.
echo "---"
echo "Removing existing conflicting resources..."
$dorcli device rm
$dorcli module rm cam
$dorcli module rm inf
$dorcli deployment rm icwe23-demo
echo "Removal done"
echo "---"

$dorcli device scan
wait_prompt "Waiting a bit until rescanned devices should have introduced themselves" 3


# Create needed camera and inference modules and describe their interfaces.
$dorcli module create cam $campathcontainer
$dorcli module desc cam $camdescpathcontainer
# --||--
$dorcli module create inf $infpathcontainer
$dorcli module desc inf $infdescpathcontainer \
    -m model -p $infmodelpathcontainer

# Create a deployment taking a picture and directing it to inference.
$dorcli deployment create icwe23-demo \
    -d webcam -m cam -f take_image_predefined_path \
    -d compute-box -m inf -f infer_predefined_paths

# Install the deployment.
$dorcli deployment deploy icwe23-demo

# Define cleanup if execution succeeds at first try.
cleanup() {
    echo "Example has finished. Composing down..."
    docker-compose -f example/docker-compose.icwe23-demo.yml down
    echo "Done."
    exit 0
}

# Execute. This might definitely fail at first, if the modules needs to be
# compiled at supervisor.
set +e
$dorcli execute icwe23-demo && cleanup

echo
echo "!!!"
echo "Assuming that the execution failed because WebAssembly has not yet finished compiling."

if [ ! -z $6 ]; then
    waittime=$6
else
    waittime=15
fi

wait_prompt "Waiting for supervisor to compile wasm" $waittime

echo "Trying to execute again..."
$dorcli execute icwe23-demo && cleanup || printf "\n!!!\nFailed again. You could try increasing the wait time by passing it as ARG6.\nNOTE that the containers are left unremoved for you to inspect their logs!\n\n"

