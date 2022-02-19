import {NS} from "Bitburner";
import {TermLogger, Penetrator, Deployer, Executor, ArgsSchema, Options, Args} from "/lib/Helpers";

interface BootOptions {
    target: string
    script: string
    args: string[]
}

let schema = [['target','n00dles'],['script','/bin/daemon.js'], ['args',['--server','n00dles']]] as ArgsSchema;

let o: BootOptions;
let logger: TermLogger;

export function autocomplete(data: any, args: Args) {
    data.flags(schema);
    const lastFlag = args.length > 1 ? args[args.length - 2] : null;
    if (lastFlag == "--target")
        return [...data.servers];
    if (lastFlag == "--script")
        return [...data.scripts];
    return [];
}

/** @param {NS} ns **/
export async function main(ns: NS) {
    logger = new TermLogger(ns);
    const p = new Penetrator(ns, logger);
    const d = new Deployer(ns, logger);
    const e = new Executor(ns, logger);
    o = new Options<BootOptions>(ns, schema).options;
    p.penetrate(o.target);
    await d.script(o.target, o.script);
    await e.execute(o.target, 1, o.script, o.args);
}
