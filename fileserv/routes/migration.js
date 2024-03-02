const express = require("express");

const utils = require("../utils.js");


let deploymentCollection = null;
let deviceCollection = null;
let moduleCollection = null;

function setDatabase(db) {
    deploymentCollection = db.collection("deployment");
    deviceCollection = db.collection("device");
    moduleCollection = db.collection("module");
}

let orchestrator = null;

function setOrchestrator(orch) {
    orchestrator = orch;
}

/**
 * Route for module migration away from a certain device.
 * @param {*} request 
 * @param {*} response 
 * @returns 
 */
const migrate = async (request, response) => {
    const deployment = await deploymentCollection
        .findOne(utils.nameOrIdFilter(request.params.deploymentId));
    const migratingModule = await
        moduleCollection
            .findOne(utils.nameOrIdFilter(request.params.moduleId));
    const migratingModuleId = migratingModule._id.toString();

    let sourceDeviceId;
    if (request.body.from) {
        sourceDeviceId = (await deviceCollection
            .findOne(utils.nameOrIdFilter(request.body.from)))
            ._id.toString();
    } else {
        // If the source device is not given, the given module is assumed to be
        // on one device only and the module on that device is selected for
        // migration.
        sourceDeviceId = Object.entries(deployment.solution)
            .find(([_did, x]) =>
                 Object.values(x.modules)
                    .find(y => y.id.toString() === migratingModuleId)
            )[0];
    }

    if (!deployment || !sourceDeviceId || !migratingModuleId) {
        response.status(404).send();
        return;
    }

    try {
        // TODO: Allow specifying the target.
        await orchestrator.migrate(deployment, migratingModuleId, sourceDeviceId);
        response
            .status(204)
            .send();
    } catch (e) {
        const err = new utils.Error(`migration deployment-${deployment.name}:module-${migratingModule.name} => device-${sourceDeviceId} failed`, e);
        console.error(err);
        console.error(e.stack || "no error stack");
        response
            .status(500)
            .json(err);
    }
}


const router = express.Router();
router.post("/:deploymentId/:moduleId", migrate);


module.exports = { setDatabase, setOrchestrator, router };
