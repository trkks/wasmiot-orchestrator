import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { getClient } from "./utils";


const client = getClient();

const program = new Command();

program
    .command("create")
    .description(`Create a new deployment

Manifest sequence can be either submitted from a file or with options that
combine together in the order given.

For example
    '-d a -m x -f g -d b -m y -f h'
will create the pairings
    [(a x g), (b y h)]
and
    '-d _ -m x -f g -d b -m y -f _'
will create the pairings
    [(null x g), (b y null)]`)
    .argument("<deployment-name-string>", "Name to give to deployment")
    .option("--manifest <manifest-file>", "Path to deployment's JSON-manifest")
    .option("--main <main-module>", "Name of the 'main script' that controls the execution of deployment; must be found in the resource listing")
    .option("--start <start-function>", "Name of the starting function inside the 'main script'")
    .requiredOption("-d --device <device-id...>", "Device to use; give valued '_' for selecting automatically")
    .requiredOption("-m --module <module-id...>", "Module to use")
    .requiredOption("-f --func <function-name...>", "Function to call; give value '_' to imply that every function in the module should be exposed")
    .action(async (name, options, _) => {
        let manifest: {
            resourcePairings: undefined | any,
            sequence: undefined | any,
            mainScript: undefined | any,
        } = {
            resourcePairings: undefined,
            sequence: undefined,
            mainScript: undefined,
        };

        if (options.manifest) {
            // Read the manifest from file in its entirety (apart from the
            // name).
            manifest = JSON.parse(
                await readFile(options.manifest, "utf8")
            );
        } else {
            console.error("Manifest arguments given:", JSON.stringify(options, null, 2));
            
            if (!(options.device.length === options.module.length && options.module.length === options.func.length)) {
                console.error(`Resource pairings do not match (${options.device.length} devices, ${options.module.length} modules and ${options.func.length} functions)`)
                process.exit(1);
            }
            
            // Build up pairings and/or sequence from options. Detect the
            // special empty '_' values and set them to null.
            const resourcePairings =  options.module
                .map((m: string, i: number) => {
                    return {
                        device: options.device[i] === "_" ? null : options.device[i],
                        module: m,
                        func: options.func[i] === "_" ? null : options.func[i],
                    }
                });

            // Set fields according to implied execution model.
            if (options.main) {
                manifest.mainScript = {
                    module: options.main,
                    function: options.start,
                };
                manifest.resourcePairings = resourcePairings;
            } else {
                manifest.sequence = resourcePairings;
            }
        }

        console.error("Created manifest:", JSON.stringify(manifest, null, 2));

        const formdata = {
            name, ...manifest
        };
        const result = await client.default.postFileManifest(formdata);
        console.log(JSON.stringify(result, null, 4));
    });

program
    .command("deploy")
    .description("Enact a deployment installing it on associated devices")
    .argument("<deployment-id-string>", "ID of the deployment")
    .action(async (deployment, _) => {
        const result = await client.default.postFileManifest1(deployment);

        console.log(JSON.stringify(result, null, 4));
    });
 
program
    .command("show")
    .description("Return information related to deployments")
    .option("-d --deployment <deployment-id-string>", "ID of a single deployment")
    .action(async (options, _) => {
        const result = 
            options.deployment
            ? await client.default.getFileManifest1(options.deployment)
            : await client.default.getFileManifest();

        console.log(JSON.stringify(result, null, 4));
    });

program
    .command("rm")
    .description("Remove all deployments")
    .action(async () => {
        const result = await client.default.deleteFileManifest();

        console.log(JSON.stringify(result, null, 4));
    })

program
    .showHelpAfterError()
    .parse();
