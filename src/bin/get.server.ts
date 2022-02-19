import { NS, Server } from 'Bitburner';
import { Application, PortIO, TermLogger, Response, ArgsSchema, Args } from '/lib/Helpers';

interface DataRequest<T> {
    id: string,
    port: number
    request: T
}

const schema = [['id', ''], ['port', 1], ['request', '']] as ArgsSchema

abstract class RequestDataThroughPortApp<T, R> extends Application<DataRequest<T>>
{

    async run() {
        var port = new PortIO(this._ns, this._options.port);
        var response = { id: this._options.id } as Response<R>;
        await this.request(this._options.request, response)
        port.write(response);
    }

    abstract request(request: T, response: Response<R>) : Promise<void>
}

class RequestServerApp extends RequestDataThroughPortApp<string, Server>
{
    async request(request: string, response: Response<Server>) {
        response.payload = this._ns.getServer(request)
    }

}

export function autocomplete(data: any, args: Args) {
    data.flags(schema);
    return [];
}

/** @param {NS} ns **/
export async function main(ns: NS) {
    await new RequestServerApp(ns, schema, TermLogger).run();    
}