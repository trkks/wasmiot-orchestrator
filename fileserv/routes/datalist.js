/**
 * Define the descriptions and implementation of Datalist core service.
 */

const { readFile, writeFile } = require("node:fs/promises");

const { ObjectId } = require("mongodb");

const utils = require("../utils");
const { WASMIOT_INIT_FUNCTION_NAME } = require("../constants");


let collection = null;

async function setDatabase(db) {
    collection = db.collection("supervisorData");
}

const fileUpload = utils.fileUpload("./files/exec/core/datalist");

/**
 * Set up the environment for inserting entries to a document later.
 */
const initData = async () => {
    let { insertedId } = await collection.insertOne({ history: [] });
    let docId = insertedId.toString();
    // TODO: Save the ID per deployment instead of this one global collection
    // for everyone.
    await writeFile("./files/exec/core/datalist/id", docId, encoding="utf-8");
};

/**
 * Return the datalist stored based on id or a specific entry if index is given.
 * @param {*} request
 * @param {*} response
 */
const getData = async (request, response) => {
    let id = await readFile("./files/exec/core/datalist/id", encoding="utf-8");
    let index = request.params.index;

    let history;
    try {
        let { history: theHistory } = await collection.findOne({ _id: ObjectId(id) });
        history = theHistory;
    } catch (error) {
        console.log("Error reading data from database: ", error);
        response.status(400).json(new utils.Error("Error reading datalist from database.", error));
        return;
    }

    let data;
    if (index) {
        data = history[index];
    } else {
        data = history;
    }

    response.json({ result: data });
};

/**
 * Add data in the request (NOTE: Data can be a string in a file, or in the
 * query-string (if URL-encodable)) to document and notify subscribers about the
 * new entry.
 * @param {*} request
 * @param {*} response
 */
const pushData = async (request, response) => {
    // NOTE: The parameters would ideally be in a JSON body or path or similar,
    // but this implementation aims to emulate current supervisor behavior,
    // where any other than primitive integer-data is passed as a file.
    let id = await readFile("./files/exec/core/datalist/id", encoding="utf-8");
    let nonPrimitiveEntry = request.files && request.files.find(x => x.fieldname == "entry");
    let entry = nonPrimitiveEntry
        ? await readFile(nonPrimitiveEntry.path, encoding="utf-8")
        : request.query.param0;
    // TODO: Based on received media type, parse the entry accordingly (e.g.,
    // integer, float, string, boolean ...).
    entry = Number(entry);
    await collection.updateOne({ _id: ObjectId(id) }, { $push: { history: entry } });

    // TODO: Notify subscribers about the new entry.

    // Respond with a URL that links to the whole history (even though its not
    // part of the deployment).
    let deploymentBasePath = request.originalUrl.split("/").slice(0, -1).join("/");
    let getUrl = new URL(
        request.protocol
        + "://"
        + request.get("host")
        + deploymentBasePath
        + "/"
        + "get"
    );

    response
        .status(200)
        .json({
            resultUrl: getUrl
        });
};

/**
 * Delete the datalist stored based on id.
 * @param {*} request
 * @param {*} response
 */
const deleteData = async (request, response) => {
    let id = request.params.dataId;
    collection.deleteOne({ _id: id });

    response.status(202).send();
};


const FUNCTION_DESCRIPTIONS = {
    /**
     * Save the 'entry' to the document identified by 'id' and then TODO forward
     * the 'entry' to registered listeners.
     */
    push: {
        // NOTE/TODO: The type is integer, because thats what Wasm mostly spits
        // out.
        parameters: [{ name: "param0", type: "integer" }],
        method: "PUT",
        output: "application/json", // Link to the matching GET path.
        mounts: [
            {
                name: "id",
                mediaType: "application/octet-stream",
                stage: "deployment"
            },
            {
                name: "entry",
                mediaType: "application/octet-stream",
                stage: "execution",
            }
        ],
        middlewares: [fileUpload, pushData]
    },
    get: {
        parameters: [],
        method: "GET",
        // TODO: All these octet streams should eventually be JSON, as they're
        // interpreted as such.
        output: "application/octet-stream",
        mounts: [
            {
                name: "id",
                mediaType: "application/octet-stream",
                stage: "deployment"
            },
            {
                name: "entry",
                mediaType: "application/octet-stream",
                stage: "output"
            }
        ],
        middlewares: [fileUpload, getData]
    },
    delete: {
        parameters: [],
        method: "DELETE",
        mounts: [
            {
                name: "id",
                mediaType: "application/octet-stream",
                stage: "execution"
            }
        ],
        middlewares: [fileUpload, deleteData]
    },
};
// Set the init function.
FUNCTION_DESCRIPTIONS[WASMIOT_INIT_FUNCTION_NAME] = {
    // These fields are necessary for the module-upload to handle the function
    // like it was found in a .wasm binary.
    parameters: [],
    method: "POST",
    output: "application/octet-stream",
    mounts: [
        {
            name: "id",
            mediaType: "application/octet-stream",
            stage: "output"
        }
    ],
    // This field is special for init-functions.
    init: initData,
};



const MODULE_NAME = "Datalist";


module.exports = {
    MODULE_NAME,
    FUNCTION_DESCRIPTIONS,
    setDatabase,
    EXPORTS: Object.entries(FUNCTION_DESCRIPTIONS).map(([n, x]) => ({name: n, parameterCount: x.parameters.length})),
};
