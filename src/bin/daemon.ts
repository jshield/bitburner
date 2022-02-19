import { NS } from "Bitburner";
import { Args, ArgsSchema, Semaphore, TermLogger, Logger, IO, Deployer, Executor, Evaluator } from "/lib/Helpers";

interface Command {
    name: string
    payload: any
};

interface Options {
    server: string
    url: string
}

let options: Options;

let mutex: Semaphore;

const argsSchema = [
    ['server', ''],
    ['url', 'ws://localhost:8082/']
] as ArgsSchema;

export function autocomplete(data: any, args: Args) {
    data.flags(argsSchema);
    return [];
}

function panic(ns: NS, msg: string) { ns.tprint(msg); ns.exit(); }

let logger : Logger;
let io : IO;
let deployer: Deployer;
let evaluator : Evaluator;

/** @param {NS} ns **/
export async function main(ns: NS) {

    logger = new TermLogger(ns);
    io = new IO(ns, logger);
    deployer = new Deployer(ns, logger);
    evaluator = new Evaluator(ns, logger, deployer);

    const handlers = {
        read: async (p) => await io.fread(p.handle),
        write: async (p) => await io.fwrite(p.handle, p.data, p.mode),
        deploy: async (p) => await deployer.deploy(p.target, p.files),
        execute: async (p) =>  await evaluator.execute(p.host, p.threads, p.script, p.args),
        isRunning: async (p) => { return { running: await ns.isRunning(p.id ?? p.script, p.host || options.server, p.args)} },
        fileExists: async (p) => { return { exists: await io.exists(p.file)} }
    };

    options = ns.flags(argsSchema) as Options;

    if (options.server === '') { panic(ns, 'server not set'); }

    var ws = new WebSocket(options.url);

    mutex = new Semaphore('ns', 1);

    var listening = true;

    var connected = false;


    ws.onopen = function () {
        // Web Socket is connected, send data using send()
        connected = true;
    };

    ws.onmessage = async function (evt) {
        const lock = await mutex.acquire();
        try {
            let cmd = JSON.parse(evt.data) as Command;
            if (cmd) {
                var handler = handlers[cmd.name];
                if (handler) {
                    var response = await handler(cmd.payload);
                    const json = JSON.stringify(response);
                    logger.log(json);
                    ws.send(json);
                } else {
                    logger.warn(`can't find handler ${cmd.name}.`)
                    ws.send(JSON.stringify({"error": `can't find handler ${cmd.name}`}));
                }
            }
        } finally {
            lock.release();
        }

    };

    ws.onclose = function () {
        // websocket is closed.
        listening = false;
    };

    do {
        await ns.asleep(5000);
    }
    while (listening);

    ns.tprint("exiting...");

}