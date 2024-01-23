const fs = require("fs");

const { ObjectId } = require("mongodb");

const constants = require("../constants.js");
const utils = require("../utils.js");


class DeviceNotFound extends Error {
    constructor(dId) {
        super("device not found");
        this.name = "DeviceNotFound";
        this.device = { id: dId };
    }
}

class ParameterMissing extends Error {
    constructor(dId, execPath, param) {
        super("parameter missing");
        this.name = "ParameterMissing";
        this.deployment = { id: dId };
        this.execPath = execPath;
        this.param = param;
    }
}

class DeploymentFailed extends Error {
    constructor(combinedResponse) {
        super("deployment failed");
        this.combinedResponse = combinedResponse;
        this.name = "DeploymentFailed";
    }
}


class MountPathFile {
    constructor(path, mediaType, stage) {
        this.path = path;
        this.media_type = mediaType;
        this.stage = stage;
    }

    static listFromMultipart(multipartMediaTypeObj) {
        const mediaType = multipartMediaTypeObj.media_type;
        if (mediaType !== 'multipart/form-data') {
            throw new Error(`Expected multipart/form-data media type, but got "${mediaType}"`);
        }

        const schema = multipartMediaTypeObj.schema;
        if (schema.type !== 'object') {
            throw new Error('Only object schemas supported');
        }
        if (!schema.properties) {
            throw new Error('Expected properties for multipart schema');
        }

        const mounts = [];
        const encoding = multipartMediaTypeObj.encoding;
        for (const [path, _] of getSupportedFileSchemas(schema, encoding)) {
            const mediaType = encoding[path]['contentType'];
            // NOTE: The other encoding field ('format') is not regarded here.
            const mount = new MountPathFile(path, mediaType);
            mounts.push(mount);
        }

        return mounts;
    }
}

    function* getSupportedFileSchemas(schema, encoding) {
        for (const [path, property] of Object.entries(schema.properties)) {
            if (property.type === 'string' && property.format === 'binary') {
                if (encoding[path] && encoding[path]['contentType']) {
                    yield [path, property];
                }
            }
        }
    }
/**
 * Fields for instruction about reacting to calls to modules and functions on a
 * device.
 */
class Instructions {
    constructor() {
        this.modules = {};
    }

    add(moduleName, funcName, instruction) {
        if (!this.modules[moduleName]) {
            this.modules[moduleName] = {};
        }
        // Initialize each function to match to an
        // instruction object. NOTE: This makes it so that each function in a
        // module can only be chained to one function other than itself (i.e. no
        // recursion).
        this.modules[moduleName][funcName] = instruction;
    }

    /**
     * Set a module and function name as the entrypoint to main script.
     * @param {*} moduleName 
     */
    mainScript(moduleName, functionName) {
        this.main = moduleName;
        this.start = functionName;
    }
}

/**
 * Struct for storing information that a single node (i.e. a device) needs for
 * deployment.
 */
class DeploymentNode {
    constructor(deploymentId, orchestratorApiBaseUrl) {
        this.orchestratorApiBase = orchestratorApiBaseUrl;
        // Used to separate similar requests between deployments at
        // supervisor.
        this.deploymentId = deploymentId;
        // The modules the device needs to download.
        this.modules = [];
        // Mapping of functions to endpoints for "transparent" RPC-calls _to_
        // this node. Endpoints that the node exposes to others.
        this.endpoints = {};
        // Chaining of results to others.
        this.instructions = new Instructions();
        // Mounts needed for the module's functions.
        this.mounts = {};
        // Base URLs for peers of a node; basically all other nodes in
        // deployment are in here somewhere.
        this.peers = {};
    }
}

/**
 * Core interface and logic of orchestration functionality.
 */
class Orchestrator {
    /**
    * @param {*} dependencies Things the orchestrator logic can't do without.
    * @param {*} options Options with defaults for orchestrator to use. Possible
    * properties are:
    * - packageManagerBaseUrl The base of the package manager server address for
    * devices to pull modules from.
    */
    constructor(dependencies, options) {
        let database = dependencies.database;
        this.deviceCollection = database.collection("device");
        this.moduleCollection = database.collection("module");
        this.deploymentCollection = database.collection("deployment");

        this.packageManagerBaseUrl = options.packageManagerBaseUrl || constants.PUBLIC_BASE_URI;
        this.orchestratorApiBaseUrl = options.orchestratorApiBaseUrl || constants.PUBLIC_BASE_URI;

        if (!options.deviceMessagingFunction) {
            throw new utils.Error("method for communicating to devices not given");
        }
        this.messageDevice = options.deviceMessagingFunction;
    }

    async solve(manifest, { availableDevices, resolving }={ resolving: false }) {
        // Handle the case when sequence is used, thus the resource pairings can
        // be deducted from it instead of having to include them excplicitly in
        // the manifest(request).
        if (manifest.sequence) {
            // Change the sequence's pairings into indices into a separate
            // pairings structure.
            // Remove possible duplicates __but keep the order__ so that
            // sequence can still index into the selected resources.
            manifest.resourcePairings = [];
            for (let i in manifest.sequence) {
                let x = manifest.sequence[i];
                let pairingIdx = manifest.resourcePairings.findIndex(
                    y => y.device === x.device
                        && y.module === x.module
                        && y.func === x.func
                );
                // TODO: What if the manifest requests two pairings with
                // null-devices i.e. [[null, m1, f1], [null, m1, f1]], but they'd
                // optimally be solved to go on different devices?
                if (pairingIdx < 0) {
                    pairingIdx = manifest.resourcePairings.length;
                    manifest.resourcePairings.push(structuredClone(x));
                }

                manifest.sequence[i] = pairingIdx;
            }
        }

        // If a certain set of devices is not supplied, fetch ALL devices from DB.
        if (!availableDevices) {
            availableDevices = await (await this.deviceCollection.find()).toArray();
        }

        manifest.resourcePairings = await fillWithResourceObjects(manifest.resourcePairings, availableDevices, this.moduleCollection);

        if (manifest.mainScript) {
            // If function name on a module is missing, it implies that all
            // functions should be made available. This makes it easier to deal with
            // the mainScript execution model, as all the different functions the
            // script might want to use do not need to be enumerated by the user.
            let funcFilledResourcePairings = [];
            for (let x of manifest.resourcePairings) {
                if (!x.func) {
                    for (let f of x.module.exports) {
                        // NOTE: Copying references!
                        funcFilledResourcePairings.push({
                            device: x.device,
                            module: x.module,
                            func: f.name
                        });
                    }
                } else {
                    funcFilledResourcePairings.push(x);
                }
            }
            manifest.resourcePairings = funcFilledResourcePairings;
        }

        //TODO: Start searching for suitable packages using saved file.
        //startSearch();

        let assignedResources = fetchAndFindResources(manifest.resourcePairings, availableDevices);

        // Now that the deployment is deemed possible, an ID is needed to
        // construct the instructions on devices.
        let deploymentId;
        if (resolving) {
            // The manifest given even if resolving might differ from original,
            // so update it in database.
            await this.deploymentCollection.updateOne(
                { _id: manifest._id },
                { $set: manifest }
            );
            deploymentId = manifest._id;
        } else {
            deploymentId = (await this.deploymentCollection.insertOne(manifest)).insertedId;
        }

        let solution = createSolution(
            deploymentId,
            manifest,
            assignedResources,
            this.packageManagerBaseUrl,
            this.orchestratorApiBaseUrl,
        )

        // Update the deployment with the created solution.
        this.deploymentCollection.updateOne(
            { _id: ObjectId(deploymentId) },
            { $set: solution }
        );

        return resolving ? solution : deploymentId;
    }

    async deploy(deployment) {
        let deploymentSolution = deployment.solution;

        let requests = [];
        for (let [deviceId, manifest] of Object.entries(deploymentSolution)) {
            let device = await this.deviceCollection.findOne({ _id: ObjectId(deviceId) });

            if (!device) {
                throw new DeviceNotFound("", deviceId);
            }

            // Start the deployment requests on each device.
            requests.push([deviceId, this.messageDevice(device, "/deploy", manifest)]);
        }

        // Return devices mapped to their awaited deployment responses.
        let deploymentResponse = Object.fromEntries(await Promise.all(
            requests.map(async ([deviceId, request]) => {
                // Attach the device information to the response.
                let response = await request;
                return [deviceId, response];
            })
        ));

        if (!deploymentResponse) {
            throw new DeploymentFailed(deploymentResponse);
        }

        return deploymentResponse;
    }

    /**
     * Start the execution of a deployment with inputs.
     * @param {*} deployment The deployment to execute.
     * @param {*} {body, files} The inputs to the deployment. Includes local
     * system filepaths as well.
     * @returns Promise of the response from the first device in the deployment
     * sequence.
     */
    async schedule(deployment, { body, files }) {
        // Pick the starting point based on execution model.
        const { url, path, method, request } = utils.getStartEndpoint(deployment);

        // OpenAPI Operation Object's parameters.
        for (let param of request.parameters) {
            if (!(param.name in body)) {
                throw new ParameterMissing(deployment._id, path, param);
            }

            let argument = body[param.name];
            switch (param.in) {
                case "path":
                    path = path.replace(param.name, argument);
                    break;
                case "query":
                    url.searchParams.append(param.name, argument);
                    break;
                default:
                    throw `parameter location not supported: '${param.in}'`;
            }
        }
        // NOTE: The URL should not contain any path before this point.
        url.pathname = path;

        let options = { method: method };

        // Request with GET/HEAD method cannot have body.
        if (!(["get", "head"].includes(method.toLowerCase()))) {
            // OpenAPI Operation Object's requestBody (including files as input).
            if (request.request_body) {
                let formData = new FormData();
                for (let { path, name } of files) {
                    formData.append(name, new Blob([fs.readFileSync(path)]));
                }
                options.body = formData;
            } else {
                options.body = { foo: "bar" };
            }
        }

        // Message the first device and return its reaction response.
        return fetch(url, options);
    }

    /**
     * Given a deployment with module and source device identifiers change an active deployment to move module out of sourceDevice.
     * @param {*} deployment Deployment document.
     * @param {*} migratingModule Identifier of the module to move.
     * @param {*} sourceDevice Identifier of the device to move module off of.
     */
    async migrate(deployment, migratingModule, sourceDevice) {
        // 1. Change the deployment manifest and document so that module is moved
        // from its current device to __another__ suitable device.

        /**
         * Set the device in resource pairings to be solved automatically when predicate
         * applies to the pairing.
         * @param {*} predicate Function returning true if the device should be
         * automatically solved.
         * @param {*} resourcePairings Resource pairings to iterate, searching
         * for device/match.
         * @returns New resource pairings with the predicate and change applied.
         */
        function autoSolveDeviceWhen(predicate, resourcePairings) {
            return resourcePairings.map((x) => {
                let y;
                if (predicate(x)) {
                    // Set that this time the device should be
                    // automatically chosen.
                    y = { device: null, module: x.module, func: x.func };
                } else {
                    y = x;
                }
                // HACKY: Map the resource pairings into just IDs, because
                // that's what solve() expects.
                return {
                    device: y.device?.toString(),
                    module: y.module.toString(),
                    func: y.func,
                };
            });
        }

        const changePredicate = ({device: d, module: m }) => d === sourceDevice && m === migratingModule;

        // Select between execution models.
        let newManifest;
        if (deployment.mainScript) {
            newManifest = {
                mainScript: deployment.mainScript,
                resourcePairings: autoSolveDeviceWhen(
                    changePredicate, deployment.resourcePairings
                ),
            };
        } else if (deployment.sequence) {
            newManifest = {
                sequence: autoSolveDeviceWhen(changePredicate, deployment.sequence),
            };
        } else {
            throw "unknown execution model in deployment";
        }

        // Fetch all devices and add a predicate that filters out the
        // combination of the source device and migrating module.
        // TODO: Might be nicer to just pass the predicate function into solve()?
        const availableDevices = await (await
        this.deviceCollection.find()).toArray();
        for (let device of availableDevices) {
            if (device._id.toString() === sourceDevice) {
                device.deploymentPredicate = (m) => m._id.toString() !== migratingModule;
            }
        }

        // Run the solving algorithm again with the constrained set of devices.
        // NOTE that other parts than just the migrating device-module -pairing
        // might change!
        newManifest._id = deployment._id;
        const newSolution = await this.solve(
            newManifest, { availableDevices, resolving: true }
        );

        // 2. Deploy the module to the target device.
        // 3. Send updated instructions to device peers.
        const newDeployment = await this.deploymentCollection
            .findOne({ _id: deployment._id});

        // Does not need to be sync.
        this.deploy(newDeployment);

        // 4. Remove module from the device it has now migrated out of.
        //TODO
    }
}


/**
 * For the sequence execution model, come up with the nth forward endpoint of
 * instruction in the execution chain.
 * @param {*} n Ordered index of some __source__ endpoint .
 * @param {*} resourcePairings Mapping of resources.
 * @param {*} perDevice Set of related deployment nodes.
 * @returns Next forward endpoint
 */
function nthInstructionForSequence(n, resourcePairings, perDevice) {
    let forwardFunc = resourcePairings[n + 1]?.func;
    let forwardDeviceIdStr = resourcePairings[n + 1]?.device._id.toString();
    let forwardDeployment = perDevice[forwardDeviceIdStr];

    let forwardEndpoint;
    if (forwardFunc === undefined || forwardDeployment === undefined) {
        forwardEndpoint = null;
    } else {
        // INVARIANT: The order of resource pairings attached to deployment is
        // still the same as it is based on the execution sequence in manifest.
        let forwardModuleId = resourcePairings[n + 1]?.module.name;
        forwardEndpoint = forwardDeployment.endpoints[forwardModuleId][forwardFunc];
    }

    return forwardEndpoint;
}

/**
 * Add main script to devices that support it.
 * @param {*} n 
 * @param {*} resourcePairings 
 * @param {*} perDevice 
 * @param {*} manifest 
 */
function selectNthAsMain(
    n,
    resourcePairings,
    perDevice,
    manifest,
) {
    const x = resourcePairings[n];
    const device = x.device._id.toString();
    const deviceSatisfies = x.module.name === manifest.mainScript.module
        && x.func === manifest.mainScript.function
    if (deviceSatisfies) {
        perDevice[device]
            .instructions
            .mainScript(x.module.name, x.func);
    }
    // Return nothings as no forward operations needed, when the control of
    // execution is fully contained inside the main script in question.
}

/**
 * Based on the execution model of deployment, add needed information into the
 * given deployment.
 * @param {*} manifest Original manifest where the execution model can be deducted from.
 * @param {*} deploymentsPerDevice The set of deployment nodes to add
 * information into (NOTE: out-parameter).
 * @param {*} resourcePairings Mappings of resources.
 */
function applyExecutionModel(manifest, deploymentsPerDevice, resourcePairings) {
    let forwardInstructionF;
    if (manifest.sequence) {
        // According to deployment manifest describing the sequence of
        // application-calls, select the next endpoint for supervisor to call after this one.
        forwardInstructionF = nthInstructionForSequence;
   } else if (manifest.mainScript) {
        // Add main script to all devices where it is satisfied.
        forwardInstructionF = selectNthAsMain;
    } else {
        throw `could not deduce execution model from deployment manifest: '${JSON.stringify(manifest, null, 2)}'`;
    }

    // Apply the selected instruction method to the devices' endpoints.
    for (let i = 0; i < resourcePairings.length; i++) {
        const [device, modulee, func] = Object.values(resourcePairings[i]);
        const deviceIdStr = device._id.toString();

        // This is needed at device regardless of execution model to figure out
        // how to interpret WebAssembly function's result.
        const sourceEndpoint = deploymentsPerDevice[deviceIdStr].endpoints[modulee.name][func];

        // Get the forward endpoint if the execution model  requires so.
        const forwardEndpoint = forwardInstructionF(
            i, resourcePairings, deploymentsPerDevice, manifest
        ) || null;

        const instruction = {
            from: sourceEndpoint,
            to: forwardEndpoint,
        };

        // Attach the created details of deployment to matching device.
        deploymentsPerDevice[deviceIdStr].instructions.add(modulee.name, func, instruction);
    }
}

/**
 * Solve for M2M-call interfaces and create individual instructions
 * (deployments) to send to devices.
 * @param {*} deploymentId The deployment ID is used to identify received POSTs
 * on devices regarding this deployment.
 * @returns The created solution.
 * @throws An error if building the solution fails.
 */
function createSolution(deploymentId, manifest, resourcePairings, packageBaseUrl, orchestratorApiBaseUrl) {
    let deploymentsToDevices = {};
    for (let x of resourcePairings) {
        let deviceIdStr = x.device._id.toString();

        // __Prepare__ to make a mapping of devices and their instructions in order to
        // bulk-send the instructions to each device when deploying.
        if (!(deviceIdStr in deploymentsToDevices)) {
            deploymentsToDevices[deviceIdStr] = new DeploymentNode(deploymentId, orchestratorApiBaseUrl);
        }

        // Add module needed on device.
        let moduleDataForDevice = moduleData(x.module, packageBaseUrl);
        deploymentsToDevices[deviceIdStr].modules.push(moduleDataForDevice);

        // Add needed endpoint to call function in said module on the device.
        let funcPathKey = utils.supervisorExecutionPath(x.module.name, x.func);
        let moduleEndpointTemplate = x.module.description.paths[funcPathKey];

        // Build the __SINGLE "MAIN" OPERATION'S__ parameters for the request
        // according to the description.
        const OPEN_API_3_1_0_OPERATIONS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
        let methods = Object.keys(moduleEndpointTemplate)
            .filter((method) => OPEN_API_3_1_0_OPERATIONS.includes(method.toLowerCase()));
        console.assert(methods.length === 1, "expected one and only one operation on an endpoint");
        let method = methods[0];

        let [responseMediaType, responseObj] = Object.entries(moduleEndpointTemplate[method].responses[200].content)[0];
        let requestBody = moduleEndpointTemplate[method].requestBody;
        let [requestMediaType, requestObj] = [undefined, undefined];
        if (requestBody != undefined) {
            [requestMediaType, requestObj] = Object.entries(requestBody.content)[0];
        }

        // Create the module object if this is the first one.
        if (!(x.module.name in deploymentsToDevices[deviceIdStr].endpoints)) {
            deploymentsToDevices[deviceIdStr]
                .endpoints[x.module.name] = {};
        }

        let endpoint = {
            // TODO: Hardcodedly selecting first(s) from list(s) and
            // "url" field assumed to be template "http://{serverIp}:{port}".
            // Should this instead be provided by the device or smth?
            url: x.module.description.servers[0].url
                .replace("{serverIp}", x.device.communication.addresses[0])
                .replace("{port}", x.device.communication.port),
            path: funcPathKey.replace("{deployment}", deploymentId),
            method: method,
            request: {
                parameters: moduleEndpointTemplate[method].parameters,
            },
            response: {
                media_type: responseMediaType,
                schema: responseObj?.schema
            }
        };
        if (requestObj) {
            endpoint.request.request_body = {
                media_type: requestMediaType,
                schema: requestObj?.schema,
                encoding: requestObj?.encoding
            };
        }

        // Finally add mounts needed for the module's functions.
        if (!(x.module.name in deploymentsToDevices[deviceIdStr].mounts)) {
            deploymentsToDevices[deviceIdStr].mounts[x.module.name] = {};
        }

        deploymentsToDevices[deviceIdStr].mounts[x.module.name][x.func] =
            mountsFor(x.module, x.func, endpoint);

        deploymentsToDevices[deviceIdStr]
            .endpoints[x.module.name][x.func] = endpoint;
    }

    // It does not make sense to have a device without any possible
    // interaction (and this would be a bug).
    let unnecessaryDevice = Object.entries(deploymentsToDevices)
        .find(([_, x]) => Object.entries(x.endpoints).length === 0);
    if (unnecessaryDevice) {
        return `no endpoints defined for device '${unnecessaryDevice[0]}'`;
    }

    // Now that the devices and functions are solved, do another iteration to
    // populate each ones' peers.
    const namePaths = resourcePairings.reduce(
        (acc, x) => {
            if (!acc[x.module.name]) {
                acc[x.module.name] = [];
            }
            acc[x.module.name].push(x.func);
            return acc;
        },
        {}
    );
    for (let x of Object.keys(deploymentsToDevices)) {
        deploymentsToDevices[x].peers = peersFor(
            x,
            namePaths,
            deploymentsToDevices
        );
    }

    applyExecutionModel(manifest, deploymentsToDevices, resourcePairings);

    let resourcesAsIds = Array.from(resourcePairings)
        .map(x => ({
            device: x.device._id,
            module: x.module._id,
            func: x.func
        }));

    return {
        solution: deploymentsToDevices,
        resourcePairings: resourcesAsIds
    };
}

MountStage = {
    DEPLOYMENT: "deployment",
    EXECUTION: "execution",
    OUTPUT: "output",
};

/**
 * Save the list of mounts for each module in advance. This makes them
 * ready for actually "mounting" (i.e. creating files in correct
 * directory) at execution time.
 *
 * NOTE: Using the "endpoints" as the source for modules and function
 * names, as the WebAssembly modules are not instantiated at this point
 * and might contain functions not intended for explicitly running (e.g.
 * custom 'alloc()' or WASI-functions).
 */
function mountsFor(modulee, func, endpoint) {
    // Grouped by the mount stage, get the sets of files to be mounted for the
    // module's function and whether they are mandatory or not.

    // TODO: When the component model is to be integrated, map arguments in
    // request to the interface described in .wit.

    request = endpoint.request;
    response = endpoint.response;
    let request_body_paths = [];
    if (request.request_body && request.request_body.media_type === 'multipart/form-data') {
        request_body_paths = MountPathFile.listFromMultipart(request.request_body);
        // Add the stage accordingly.
        for (let request_body_path of request_body_paths) {
            request_body_path.stage = modulee.mounts[func][request_body_path.path].stage
        }
    }

    // Check that all the expected media types are supported.
    let found_unsupported_medias = request_body_paths.filter(x => !constants.FILE_TYPES.includes(x.media_type));
    if (found_unsupported_medias.length > 0) {
        throw new Error(`Input file types not supported: "${JSON.stringify(found_unsupported_medias, null, 2)}"`);
    }

    // Get a list of expected file parameters. The 'name' is actually
    // interpreted as a path relative to module root.
    let param_files = request.parameters
        .filter(parameter => parameter.in === 'requestBody' && parameter.name !== '')
        .map(parameter =>
            new MountPathFile(parameter.name, 'application/octet-stream', MountStage.EXECUTION)
        );

    // Lastly if the _response_ contains files, the matching filepaths need
    // to be made available for the module to write as well.
    let response_files = [];
    if (response.media_type === 'multipart/form-data') {
        response_files = MountPathFile.listFromMultipart(response.response_body);
    } else if (constants.FILE_TYPES.includes(response.media_type)) {
        let outputMount = Object.entries(
                modulee.mounts[func]
            ).find(([_, mount]) => mount.stage === MountStage.OUTPUT);
        if (!outputMount) {
            throw `output mount of '${response.media_type}' expected but is missing`;
        }
        let path = outputMount[0];
        response_files = [new MountPathFile(path, response.media_type, MountStage.OUTPUT)]
    }
    // Add the output stage and required'ness to all these.
    for (let response_file of response_files) {
        response_file.stage = MountStage.OUTPUT;
    }

    let mounts = [...param_files, ...request_body_paths, ...response_files];

    // TODO: Use groupby instead of this triple-set-threat.
    let execution_stage_mount_paths = mounts.filter(y => y.stage === MountStage.EXECUTION);
    let deployment_stage_mount_paths = mounts.filter(y => y.stage === MountStage.DEPLOYMENT);
    let output_stage_mount_paths = mounts.filter(y => y.stage === MountStage.OUTPUT);

    return {
        [MountStage.EXECUTION]: execution_stage_mount_paths,
        [MountStage.DEPLOYMENT]: deployment_stage_mount_paths,
        [MountStage.OUTPUT]: output_stage_mount_paths,
    };
}

/**
 * Create a mapping to lists of peer-device execution URLs excluding the
 * `device` itself.
 * @param {*} device Device to not include.
 * @param {{ moduleName: funcName }} namePaths Deployment's functions by modules 
 * @param {*} nodes Mapping of devices to their individual
 * deployment information.
 */
function peersFor(device, namePaths, nodes) {
    let obj = {};
    for (let moduleName of Object.keys(namePaths)) {
        const funcNames = namePaths[moduleName];
        obj[moduleName] = {};
        for (let funcName of funcNames) {
            obj[moduleName][funcName] = [];
            for (let peer of Object.keys(nodes)) {
                if (peer === device) {
                    continue;
                }
                if (nodes[peer].endpoints[moduleName]
                    && nodes[peer].endpoints[moduleName][funcName]) {
                    const peerEndpoint = nodes[peer].endpoints[moduleName][funcName];
                    const peerUrl = `${peerEndpoint.url}${peerEndpoint.path}`
                    obj[moduleName][funcName].push(peerUrl)
                }
            }
        }
    }
    return obj;
}

/**
 * Based on deployment sequence, confirm the existence (funcs in modules) and
 * availability (devices) of needed resources and select most suitable ones if
 * so chosen.
 * @param {*} resourcePairings Mapping of modules and functions to selected resources i.e. devices.
 * @returns The same pairings but with intelligently selected combination of
 * resources [[device, module, func]...] as Objects. TODO: Throw errors if fails
 * @throws String error if validation of given sequence fails.
 */
function fetchAndFindResources(resourcePairings, availableDevices) {
    let selectedModules = [];
    let selectedDevices = [];

    // Fetch the orchestrator device in advance if there are any core modules
    // to be used.
    let orchestratorDeviceIdx = availableDevices.findIndex(x => x.name === "orchestrator");
    let orchestratorDevice = availableDevices[orchestratorDeviceIdx];
    // At the same time, remove the orchestrator from the list of available
    // devices (i.e., Wasm-workloads shouldn't be possible to be deployed on
    // orchestrator).
    availableDevices.splice(orchestratorDeviceIdx, 1);

    // Iterate all the items in the request's sequence and fill in the given
    // modules and devices or choose most suitable ones.
    for (let [device, modulee, funcName] of resourcePairings.map(Object.values)) {
        // If the module and device are orchestrator-based, return immediately.
        if (modulee.isCoreModule) {
            selectedModules.push(modulee);
            selectedDevices.push(orchestratorDevice);
            continue;
        }

        // Selecting the module automatically is useless, as they can
        // only do what their exports allow. So a well formed request should
        // always contain the module-id as well.
        // Still, do a validity-check that the requested module indeed
        // contains the func.
        if (modulee.exports.find(x => x.name === funcName) !== undefined) {
            selectedModules.push(modulee);
        } else {
            throw `Failed to find function '${funcName}' from requested module: ${JSON.stringify(modulee, null, 2)}`;
        }

        function deviceSatisfiesModule(d, m) {
            // This condition placed on device prevents unwanted combinations of
            // device and module e.g., when re-solving during migration.
            const allowedToSelect = d.deploymentPredicate ? d.deploymentPredicate(m) : true;

            return allowedToSelect && m.requirements.every(
                r => d.description.supervisorInterfaces.find(
                    interfacee => interfacee === r.name // i.kind === r.kind && i.module === r.module
                )
            );
        }

        if (device) {
            // Check that the device actually can run module and function.
            if (!deviceSatisfiesModule(device, modulee)) {
                throw `device '${device.name}' does not satisfy requirements of module '${modulee.name}'`;
            }
        } else {
            // Search for a device that could run the module.
            device = availableDevices.find(d => deviceSatisfiesModule(d, modulee));

            if (!device) {
                throw `no matching device satisfying all requirements: ${JSON.stringify(modulee.requirements, null, 2)}`;
            }
        }
        selectedDevices.push(device);
    }

    // Check that length of all the different lists matches (i.e., for every
    // item in deployment sequence found exactly one module and device).
    let length =
        resourcePairings.length === selectedModules.length &&
        selectedModules.length === selectedDevices.length
        ? resourcePairings.length
        : 0;
    // Assert.
    if (length === 0) {
        throw `Error on deployment: mismatch length between deployment (${resourcePairings.length}), modules (${selectedModules.length}) and devices (${selectedDevices.length}) or is zero`;
    }

    // Now that the devices that will be used have been selected, prepare to
    // update the deployment sequence's devices in database with the ones
    // selected (handles possibly 'null' devices).
    let updatedResources = Array.from(resourcePairings);
    for (let i = 0; i < updatedResources.length; i++) {
        updatedResources[i].device = selectedDevices[i];
        updatedResources[i].module = selectedModules[i];
        updatedResources[i].func   = resourcePairings[i].func;
    }

    return updatedResources;
}

/**
 * Extract needed module data that a device needs.
 * @param {*} modulee The module record in database to extract data from.
 * @param {*} packageBaseUrl The base of the package manager server address for
 * devices to pull modules from.
 * @returns Data needed and usable by a device.
 */
function moduleData(modulee, packageBaseUrl) {
    // Add data needed by the device for pulling and using a binary
    // (i.e., .wasm file) module.
    let binaryUrl;
    binaryUrl = new URL(packageBaseUrl);
    binaryUrl.pathname = `/file/module/${modulee._id}/wasm`;
    let descriptionUrl;
    descriptionUrl = new URL(packageBaseUrl);
    descriptionUrl.pathname = `/file/module/${modulee._id}/description`;

    // This is for any other files related to execution of module's
    // functions on device e.g., ML-models etc.
    let other = {};
    if (modulee.dataFiles) {
        for (let filename of Object.keys(modulee.dataFiles)) {
            other[filename] = (new URL(packageBaseUrl+`file/module/${modulee._id}/${filename}`)).toString();
        }
    }

    return {
        id: modulee._id,
        name: modulee.name,
        urls: {
            binary: binaryUrl.toString(),
            description: descriptionUrl.toString(),
            other: other,
        },
    };
}

/**
 * Instead of just document-IDs, fill in their matching objects from database.
 * @param {*} justIds
 * @param {*} availableDevices List of objects representing available devices.
 * @param {*} moduleCollection Database collection for querying module objects.
 * @returns List similar to input `justIds` but with objects instead of just
 * their IDs.
 */
async function fillWithResourceObjects(justIds, availableDevices, moduleCollection) {
    let resourcePairings = [];

    for (let x of justIds) {
        // Find with id _or name_ to allow selecting resources more
        // human-friendly.
        if (x.device) {
            // Do the query manually on the collection to avoid extra
            // DB-access.
            const dFilters = utils.nameOrIdFilter(x.device)["$or"];
            x.device = availableDevices
                .find(y =>
                    Object.entries(dFilters)
                        .some(([fieldName, fieldValue]) =>
                            y[fieldName] === fieldValue));
        }

        let filter = utils.nameOrIdFilter(x.module);

        // Fetch the modules from remote URL similarly to how Docker fetches
        // from registry/URL if not found locally.
        // TODO: Actually use a remote-fetch.
        x.module = await moduleCollection.findOne(filter);

        resourcePairings.push(x);
    }
 
    return resourcePairings;
}


const ORCHESTRATOR_ADVERTISEMENT = {
    name: "orchestrator",
    type: constants.DEVICE_TYPE,
    port: 3000,
};

const ORCHESTRATOR_WASMIOT_DEVICE_DESCRIPTION = {
    "platform": {
        "memory": {
            "bytes": null
        },
        "cpu": {
            "humanReadableName": null,
            "clockSpeed": {
                "Hz": null
            }
        }
    },
    "supervisorInterfaces": []
};


module.exports = {
    Orchestrator,
    ORCHESTRATOR_ADVERTISEMENT,
    ORCHESTRATOR_WASMIOT_DEVICE_DESCRIPTION
};
