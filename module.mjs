import Logging from "scale-logging";
import * as fs from "node:fs";
import path from "node:path";

let log = new Logging('Modules');

class Module {
    /**
     * Create a module.
     * @param {string} modName Module name. Must be filesystem-friendly.
     * @param {function} exec Runs in the module scope after the module has been imported.
     * @returns type `Module`: Export this as the default.
     */
    constructor(modName, exec) {

        if (typeof modName !== 'string' && typeof modName !== 'number' && typeof modName !== 'boolean') {
            log.error('Cannot parse input for modName: is not a string, number, nor boolean');
            return;
        }
        this.moduleName = modName;

        if (typeof exec !== 'function') this.exec = () => {return null;}
        this.exec = exec;

        this.config = DynamicImport.getModuleConfig(modName);
    }

    async reloadConfig() {
        if (this.moduleName) this.config = getModuleConfig(this.moduleName);
        else log.d(new Error('Cannot reload module configuration when the module name is not present or is invalid'));
    }
}

class DynamicImport {

    /**
     * Get a module's configuration.
     * @param {string} modName 
     * @returns The specified JSON configuration, duh.
     */
    static getModuleConfig(modName) {
        if (typeof modName !== 'string') return null;
        let data = {};
        let dataPath = `./moduleconfigs/${modName.toLowerCase()}.json`;
        try {
            if (fs.existsSync(dataPath)) data = JSON.parse(fs.readFileSync(dataPath));
            return data;
        } catch (err) {
            log.warn(`Could not import module data from '${dataPath}': ${err.stack}`);
            return data;
        }
    }

    /**
     * Scan a directory's root subcontents for scripts and import constructed modules.
     * @param {string} dir Directory to scan. Relative to the process's CWD.
     */
    constructor(dir) {

        let modules = [];
        let objs = {};
        let searchdir = path.join(process.cwd(), dir);
        fs.readdir(searchdir, (err, files) => {

            if (err) {
                log.error(`Cannot start up: Could not list files in '${dir}'.\n ${err.stack}`);
                return;
            }
            if (files.length == 0) {
                log.warn(`No files were found in '${dir}'. Nothing to do.`);
                return;
            }

            let validFiles = [];
            files.forEach((value, i, array) => {
                if (value.endsWith('.mjs')) validFiles.push(value); // If it's a valid module, push it to the array
            });

            validFiles.forEach(async (value, i, array) => {

                let modTempObject = await import(searchdir + value);

                // Invalid module checks
                if (typeof modTempObject.default == 'undefined') {
                    log.warn(`Module '${value}' does not contain a default export, skipping.`);
                    return;
                }
                if (typeof modTempObject.default.moduleName == 'undefined') {
                    log.warn(`Module '${value}' does not export the default property 'moduleName', skipping.`);
                    return;
                }
                const tempModuleName = modTempObject.default.moduleName;
                if (modules.includes(tempModuleName)) {
                    log.warn(`Module '${tempModuleName}' (${value}) conflicts with another module, skipping.`);
                    return;
                } else {
                    modules.push(tempModuleName); // Used to prevent importing modules with names that conflict with each other
                }

                objs[tempModuleName] = modTempObject;
                if (typeof modTempObject !== 'object') {
                    log.warn(`Default export for module '${tempModuleName}' (${value}) has a non-standard type.`);
                } else {
                    if (typeof modTempObject.default.exec == 'undefined') {
                        log.warn(`Module '${tempModuleName}' (${value}) does not export the default function 'exec'.`);
                    } else {
                        try {
                            modTempObject.default.exec(); // Call the module default execution function. Can be either asynchronous or synchronous.
                        } catch (err) {
                            log.error(`Module '${tempModuleName}' (${value}) crashed. Stack:\n${err.stack}`); 
                            // This is called only for synchronous execution functions. Async exec functions that aren't wrapped in a try-catch will stop the process.
                        }
                    }
                }
            
            });
            return objs;
        });
    }
}

export { DynamicImport };
export default Module;