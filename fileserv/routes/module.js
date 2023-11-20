const { readFile } = require("node:fs/promises");
const express = require("express");

const { MODULE_DIR } = require("../constants.js");
const utils = require("../utils.js");


let database = null;

function setDatabase(db) {
    database = db;
}

class ModuleCreated {
    constructor(id) {
        this.id = id;
    }
}

class ModuleDescribed {
    constructor(description) {
        this.description = description;
    }
}

class WasmFileUpload {
    constructor(updateObj) {
        this.type = "wasm";
        this.updateObj = updateObj;
    }
}

class MlModelFileUploaded {
    constructor(type, updateObj) {
        this.type = type;
        this.updateObj = updateObj;
    }
}

class ImageUploaded {
    constructor(type, updateObj) {
        this.type = type;
        this.updateObj = updateObj;
    }
}

/**
 * Implements the logic for creating a new module.
 * @returns Promise about interpreting the .wasm binary and attaching it to
 * created module resource. On success it results to the added module's ID.
 */
const createNewModule = async (metadata, files) => {
    // Create the database entry.
    let moduleId = (await database.create("module", [metadata]))
        .insertedIds[0];

    // Attach the Wasm binary.
    return addModuleBinary({_id: moduleId}, files[0]).then(() => moduleId);
}

/**
 *
 * @param {*} moduleId
 * @returns [failCode, module]
 */
const getModuleBy = async (moduleId) => {
    // Common database query in any case.
    let getAllModules = moduleId === undefined;
    let matches;
    try {
        let filter = getAllModules ? {} : { _id: moduleId };
        matches = await database.read("module", filter);
    } catch (e) {
        let err = ["database query failed", e];
        return [500, err];
    }

    if (getAllModules) {
        // Return all modules.
        return [0, matches];
    } else {
        // Return the module identified by given ID.
        if (matches.length === 0) {
            let err = `no matches for ID ${moduleId}`;
            return [404, err];
        } else if (matches.length > 1) {
            let err = `too many matches for ID ${moduleId}`;
            return [500, err];
        } else {
            let doc = matches[0];
            return [0, [doc]];
        }
    }
};

/**
 * GET
 * - a single Wasm-module's whole metadata (moduleId)
 * - a single Wasm-module's whole OpenAPI description (moduleId/description)
 * - all available Wasm-modules' metadata (no moduleId)
 */
const getModule = (justDescription) => (async (request, response) => {
    let [failCode, modules] = await getModuleBy(request.params.moduleId);
    if (failCode) {
        console.error(...modules);
        response.status(failCode).json(new utils.Error(modules));
    } else {
        if (justDescription) {
            console.log("Sending description of module: ", modules[0].name);
            // Return the description specifically.
            response.json(modules[0].description)
        } else {
            console.log("Sending metadata of modules: ", modules.map(x => x.name));
            response.json(modules);
        }
    }
});

/**
 * Serve the a file relate to a module based on module ID and file extension.
 */
const getModuleFile = async (request, response) => {
    let doc = (await database.read("module", { _id: request.params.moduleId }))[0];
    let filename = request.params.filename;
    if (doc) {
        let fileObj;
        if (filename === "wasm") {
            fileObj = doc.wasm;
        } else {
            fileObj = doc.dataFiles[filename];
        }

        if (!fileObj) {
            response.status(400).json({
                err: `file '${filename}' missing from module '${doc.name}'`
            });
            return;
        }
        console.log(`Sending '${filename}' file from file-path: `, fileObj.path);
        // TODO: A 'datafile' might not be application/binary in every case.
        let options = { headers: { 'Content-Type': filename == "wasm" ? 'application/wasm' : 'application/binary' } };
        response.sendFile(fileObj.path, options);
    } else {
        let errmsg = `Failed querying for module id: ${request.params.moduleId}`;
        console.log(errmsg);
        response.status(400).json({ err: errmsg });
    }
}

/**
 * Parse metadata from a Wasm-binary to database along with its name.
 */
const createModule = async (request, response) => {
    try {
        let result = await createNewModule(request.body, request.files);

        response
            .status(201)
            .json(new ModuleCreated(result));
    } catch (e) {
        if (e === "exists") {
            response.status(400).json(new utils.Error(undefined, e));
        } else if (e === "bad") {
            let err = ["Failed attaching a file to module", e];
            console.error(...err);
            // TODO Handle device not found on update.
            response
                .status(500)
                .json(new utils.Error(...err));
        } else {
            console.error("unknown error", e);
            response
                .status(500)
                .json(new utils.Error("unknown error"));
        }
    }
};

const getFileUpdate = async (file) => {
    let originalFilename = file.originalname;
    let fileExtension = originalFilename.split(".").pop();

    // Add additional fields initially from the file-upload and save to
    // database.
    let updateObj = {};
    let updateStruct = {
        originalFilename: originalFilename,
        fileName: file.filename,
        path: file.path,
    };

    let data;
    try {
        data = await readFile(file.path);
    } catch (err) {
        console.log("couldn't read Wasm binary from file ", file.path, err);
        // TODO: Should this really be considered server-side error (500)?
        response.status(500).json({err: `Bad Wasm file: ${err}`});
        return;
    }

    // Perform actions specific for the filetype to update
    // non-filepath-related metadata fields.
    let result;
    if (fileExtension === "wasm") {
        updateObj["wasm"] = updateStruct;

        try {
            await parseWasmModule(data, updateObj)
        } catch (e) {
            let err = ["failed compiling Wasm", e]
            console.error(...err);
            throw new utils.Error(...err);
        }
        result = new WasmFileUpload(updateObj);
    } else {
        // All other filetypes are to be "mounted".
        updateObj[file.fieldname] = updateStruct;
        switch (fileExtension) {
            // Model weights etc. for an ML-application.
            case "pb":
            case "onnx":
                result = new MlModelFileUploaded(fileExtension, updateObj);
                break;
            default:
                switch (file.mimetype) {
                    case "image/jpeg":
                    case "image/jpg":
                    case "image/png":
                        result = new ImageUploaded(fileExtension, updateObj);
                        return result;
                }
                let err = `unsupported file extension: '${fileExtension}'`;
                throw new utils.Error(err);
        }
    }

    return result;
}

/**
 * Attach _binary_file (i.e., .wasm) to a module.
 *
 * Saves the file to the server filesystem and references to it into module's
 * database-entry matching a module-ID given in the body.
 */
const addModuleBinary = async (module, file) => {
    let result = await getFileUpdate(file);
    if (result.type !== "wasm") {
        throw new utils.Error("file given as module binary is not a .wasm file");
    }
    let updateObj = result.updateObj;

    let filter = { _id: module._id };
    // Now actually update the database-document, devices and respond to
    // caller.
    await updateModule(filter, updateObj);

    console.log(`Updated module '${JSON.stringify(filter, null, 2)}' with data:`, result.updateObj);

    // Tell devices to fetch updated files on modules.
    await notifyModuleFileUpdate(filter._id);

    return result;
};


/**
 * Attach _data_files (i.e., not .wasm) to a module.
 *
 * Saves the files to the server filesystem and references to them into module's
 * database-entry matching a module-ID given in the body.
 */
const addModuleDataFiles = async (moduleId, files) => {
    let update = { dataFiles: {} };
    for (let file of files) {
        let result;
        try {
            result = await getFileUpdate(file);
        } catch (e) {
            let err = ["failed attaching file to module", e];
            console.error(...err);
            throw new utils.Error(...err);
        }

        if (result.type === "wasm") {
            throw new utils.Error("Wasm file not allowed at data file update");
        }
        let [[key, obj]] = Object.entries(result.updateObj);
        update.dataFiles[key] = obj;
    }

    let filter = { _id: moduleId };
    // Now actually update the database-document, devices and respond to
    // caller.
    await updateModule(filter, update);

    console.log(`Updated module '${JSON.stringify(filter, null, 2)}' with data:`, update);

    // Tell devices to fetch updated files on modules.
    await notifyModuleFileUpdate(filter._id);
};

const describeModule = async (request, response) => {
    // Prepare description for the module based on given info for functions
    // (params & outputs) and files (mounts).
    let functions = {};
    for (let [funcName, func] of Object.entries(request.body).filter(x => typeof x[1] === "object")) {
        functions[funcName] = {
            method: func.method.toLowerCase(),
            parameters: Object.entries(func)
                .filter(([k, _v]) => k.startsWith("param"))
                .map(([k, v]) => ({ name: k, type: v })),
            mounts: "mounts" in func
                ? Object.fromEntries(
                    Object.values(func.mounts)
                        // Map files by their form fieldname to this function's mount.
                        .map(({ name, stage }) => ([ name, {
                            // If no file is given the media type cannot be
                            // determined and is set to default.
                            mediaType: (
                                request.files.find(x => x.fieldname === name)?.mimetype
                                || "application/octet-stream"
                            ),
                            stage: stage,
                        }]))
                ) : {},
            outputType:
                // An output file takes priority over any other output type.
                func.mounts?.find(({ stage }) => stage === "output")?.mimetype
                || func.output
        };
    }

    // Check that the described mounts were actually uploaded.
    let missingFiles = [];
    for (let [funcName, func] of Object.entries(functions)) {
        for (let [mountName, mount] of Object.entries(func.mounts)) {
            if (mount.stage == "deployment" && !(request.files.find(x => x.fieldname === mountName))) {
                missingFiles.push([funcName, mountName]);
            }
        }
    }
    if (missingFiles.length > 0) {
        response
            .status(400)
            .json(new utils.Error(`Functions missing mounts: ${JSON.stringify(missingFiles, null, 2)}`));
        return;
    }
    // Save associated files ("mounts") adding their info to the database entry.
    await addModuleDataFiles(request.params.moduleId, request.files);

    // Get module from DB after file updates (FIXME which is a stupid back-and-forth).
    let [failCode, [modulee]] = await getModuleBy(request.params.moduleId);
    if (failCode) {
        console.error(...value);
        response.status(failCode).json(new utils.Error(value));
        return;
    }

    let description = utils.moduleEndpointDescriptions(modulee, functions);
    let mounts = Object.fromEntries(
        Object.entries(functions)
            .map(([funcName, func]) => [ funcName, func.mounts || {} ])
    );

    try {
        await updateModule({ _id: request.params.moduleId }, { mounts: mounts, description: description });
    } catch (e) {
        let err = ["failed updating module with description", e];
        console.error(...err);
        response.status(500).json(new utils.Error(...err));
        return;
    }

    response.json(new ModuleDescribed(description));
};

/**
 * DELETE a single or all available Wasm-modules.
 */
const deleteModule = async (request, response) => {
    let deleteAllModules = request.params.moduleId === undefined;
    let filter = deleteAllModules ? {} : { _id: request.params.moduleId };
    let deletedCount = (await database.delete("module", filter)).deletedCount;
    if (deleteAllModules) {
        response.json({ deletedCount: deletedCount });
    } else {
        response.status(204).send();
    }
}


/**
 * Parse WebAssembly module from data and add info extracted from it into input object.
 * @param {*} data Data to parse WebAssembly from e.g. the result of a file-read.
 * @param {*} outFields Object to add new fields into based on parsed
 * WebAssembly (e.g. module exports etc.)
 */
async function parseWasmModule(data, outFields) {
    // Get the exports and imports directly from the Wasm-binary itself.
    let wasmModule = await WebAssembly.compile(data);

    let importData = WebAssembly.Module.imports(wasmModule)
        // Just get the functions for now.
        .filter(x => x.kind === "function");

    // Each import goes under its module name.
    let importObj = Object.fromEntries(importData.map(x => [x.module, {}]));
    for (let x of importData) {
        // Fake the imports for instantiation.
        importObj[x.module][x.name] = () => {};
    }
    // An instance is needed for more information about exported functions,
    // although not much can be (currently?) extracted (for example types would
    // probably require more specific parsing of the binary and they are just
    // the Wasm primitives anyway)...
    let instance = await WebAssembly.instantiate(wasmModule, importObj);
    let exportData =  WebAssembly.Module.exports(wasmModule)
        // Just get the names of functions for now; the
        // interface description attached to created modules is
        // trusted to match the uploaded WebAssembly binary.
        .filter(x => x.kind === "function")
        .map(x => new Func(x.name, instance.exports[x.name].length));

    outFields.requirements = importData;
    outFields.exports = exportData;
}

/**
* Notify devices that a module previously deployed has been updated.
* @param {*} moduleId ID of the module that has been updated.
*/
async function notifyModuleFileUpdate(moduleId) {
    // Find devices that have the module deployed and the matching deployment manifests.
    let deployments = (await database.read("deployment"));
    let devicesToUpdatedManifests = {};
    for (let deployment of deployments.filter(x => x.fullManifest)) {
        // Unpack the mapping of device-id to manifest sent to it.
        let [deviceId, manifest] = Object.entries(deployment.fullManifest)[0];

        if (manifest.modules.some(x => x.id.toString() === moduleId)) {
            if (devicesToUpdatedManifests[deviceId] === undefined) {
                devicesToUpdatedManifests[deviceId] = [];
            }
            devicesToUpdatedManifests[deviceId].push(manifest);
        }
    }

    // Deploy all the manifests again, which has the same effect as the first
    // time (following the idempotence of ReST).
    for (let [deviceId, manifests] of Object.entries(devicesToUpdatedManifests)) {
        let device = (await database
            .read("device", { _id: deviceId }))[0];

        if (!device) {
            throw new utils.Error(`No device found for '${deviceId}' in manifest#${i}'`);
        }

        for (let manifest of manifests) {
            await utils.messageDevice(device, "/deploy", manifest);
        }
    }
}

/**
* Update the modules matched by filter with the given fields.
* @param {*} filter To match the modules to update.
* @param {*} fields To add to the matched modules.
*/
async function updateModule(filter, fields) {
    let updateRes = await database.update("module", filter, fields, false);
    if (updateRes.matchedCount === 0) {
        throw "no module matched the filter";
    }
}

class Func {
    constructor(name, parameterCount) {
        this.name = name;
        this.parameterCount = parameterCount;
    }
}

const fileUpload = utils.fileUpload(MODULE_DIR, "module");


const router = express.Router();
router.post(
    "/",
    fileUpload,
    // A .wasm binary is required.
    utils.validateFileFormSubmission,
    createModule,
);
router.post(
    "/:moduleId/upload",
    fileUpload,
    describeModule,
);
router.get("/:moduleId?", getModule(false));
router.get("/:moduleId/description", getModule(true));
router.get("/:moduleId/:filename", getModuleFile);
router.delete("/:moduleId?", /*authenticationMiddleware,*/ deleteModule);

module.exports = { setDatabase, router, createNewModule };
