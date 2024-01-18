const { ObjectId } = require("mongodb");
const express = require("express");

const { EXECUTION_INPUT_DIR } = require("../constants.js");
const utils = require("../utils.js");


let deploymentCollection = null

function setDatabase(db) {
    deploymentCollection = db.collection("deployment");
}

let orchestrator = null

function setOrchestrator(orch) {
    orchestrator = orch;
}

/**
 * Send data to the first device in the deployment-sequence in order to
 * kickstart the application execution.
 */
const execute = async (request, response) => {
    let filter = {};
    try {
        filter._id = ObjectId(request.params.deploymentId);
    } catch (e) {
        console.error(`Passed in deployment-ID '${request.params.deploymentId}' not compatible as ObjectID. Using it as 'name' instead`);
        filter.name = request.params.deploymentId;
    }
    let deployment = await deploymentCollection.findOne(filter);

    if (!deployment) {
        response.status(404).send();
        return;
    }

    try {
        let args = {};
        args.body = request.body;
        if (request.files) {
            args.files = request.files.map(file => ({ path: file.path, name: file.fieldname }));
        } else {
            args.files = [];
        }

        let execResponse = await orchestrator.schedule(deployment, args);
        if (!execResponse.ok) {
            throw JSON.stringify(await execResponse.json());
        }

        let json = await execResponse.json();

        console.log("Execution call returned:", JSON.stringify(json, null, 2));

        let result;
        let message;
        let statusCode;

        // TODO: This is just temporary way to check for result. Would be
        // better that supervisor appropriately responds with error code,
        // instead of just always 200.
        if (json.resultUrl && json.status !== "error") {
            // Check if the result has a URL to follow...
            try {
                result = { url: new URL(json.resultUrl) };
                message = "the result will be available at attached URL";
                statusCode = 200;
            } catch (e) {
                result = json;
                message = "execution call returned something unexpected or not parseable to a URL";
                statusCode = 500;
                console.error(message, result.resultUrl);
            }
        } else if (json.error) {
            result = new utils.Error(json.error);
            message = "execution call failed";
            statusCode = 500;
        }

        response
            .status(statusCode)
            .json({
                "message": message,
                ...result
            });
    } catch (e) {
        const err = new utils.Error("scheduling work failed", e);
        console.error(err);
        response
            .status(500)
            .json(err);
    }
}

const fileUpload = utils.fileUpload(EXECUTION_INPUT_DIR);


const router = express.Router();
router.post("/:deploymentId", fileUpload, execute);


module.exports = { setDatabase, setOrchestrator, router };