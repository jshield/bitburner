import { NS, Server } from 'Bitburner';
import { Application, PortIO, TermLogger, Response, ArgsSchema, Args } from '/lib/Helpers';

interface ReadPort {
    port: number
}

class ReadPortApplication extends Application<ReadPort> {
    async run(): Promise<void> {
        var port = new PortIO(this._ns, this._options.port)
        this._logger.info(port.read())
    }

}

const schema = [['port', 1]] as ArgsSchema

export function autocomplete(data: any, args: Args) {
    data.flags(schema);
    return [];
}

/** @param {NS} ns **/
export async function main(ns: NS) {
    await new ReadPortApplication(ns, schema, TermLogger).run();    
}