if [ $# -lt 5 ]; then
    echo "Expecting 5 arguments, got $#"
    exit 1
fi

if ! command -v python3; then
    echo "'python3' is required to run this script"
    exit 1
fi

camwasmpath=$1
camdescriptionpath=$2
infwasmpath=$3
infdescriptionpath=$4
infmodelpath=$5

set -e

# Printing the message $1, stop and wait for $2 seconds.
wait_prompt() {
    for i in $(seq 0 $2);
    do
        printf "\r$1... (%2ds)" $(( $2 - $i ))
        sleep 1
    done
    echo ""
}

orcli() {
    npm run client -- "$@"
}

# Wait a bit before requests in order to give time for orchestrator to start.
wait_prompt "Waiting a bit until orchestrator should have started" 5

# Remove possibly conflicting resources that are there already.
echo "---"
echo "Removing existing conflicting resources..."
orcli device rm
orcli module rm cam
orcli module rm inf
orcli deployment rm icwe23-demo
echo "Removal done"
echo "---"

# Scan for devices.
orcli device scan

# Create needed camera and inference modules and describe their interfaces.
orcli module create cam $camwasmpath
orcli module desc cam $camdescriptionpath
# --||--
orcli module create inf $infwasmpath
orcli module desc inf $infdescriptionpath \
    -m model -p $infmodelpath

# Create a deployment taking a picture and directing it to inference.
orcli deployment create icwe23-demo \
    -d webcam      -m cam -f take_image_predefined_path \
    -d compute-box -m inf -f infer_predefined_paths

# Install the deployment.
orcli deployment deploy icwe23-demo

# Follow request links attempting to get the result (JSON) of inference.
getresult() {
    resulturl=$1
    echo "Requesting result from:" $resulturl 1>&2
    echo "---" 1>&2

    response=$(curl $resulturl)
    echo "Responded with:" "$response" 1>&2
    echo "---" 1>&2

    result=$(echo $response | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin)['result']))")
    echo "Value in result field:" $result 1>&2
    echo "---" 1>&2

    echo $result
}

demo() {
    orchexecuteoutput=$1
    echo "---"
    # Interpret the response JSON of orchestrator (removing whatever npm prints
    # before it).
    orchresponse=$(echo $orchexecuteoutput | python3 -c "import sys; x=sys.stdin.read(); print(x[x.index('{'):])") || exit 1

    echo "Execution responded:" $orchresponse
    echo "---"

    wait_prompt "Waiting some time for camera to be ready" 3
    camresulturl=$(echo $orchresponse | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])") || exit 1

    # Cam "result" (remove quotes from JSON string).
    infresulturl=$(getresult $(echo $camresulturl | tr -d '"'))

    wait_prompt "Waiting some time for inference to be ready" 5

    # Inference result.
    infresult=$(getresult $(echo $infresulturl | tr -d '"'))

    # Check if the result was indeed ready.
    echo $infresult | python3 -c "import sys, json; x=json.load(sys.stdin); print('Inference result is:', int(x[0])) if int(x[0]) else sys.exit(1)" || return 1
}

# Make the execution request only once.
theorchexecuteoutput=$(orcli execute icwe23-demo)
echo "Orchestrator responded with:" $theorchexecuteoutput
demo "$theorchexecuteoutput" && exit 0

exit 1
