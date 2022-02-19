import { NetscriptPort, NS, ProcessInfo } from "Bitburner";

/**
 * A lock that is granted when calling [[Semaphore.acquire]].
 */
type Lock = {
    release: () => void
}

/**
 * A task that has been scheduled with a [[Semaphore]] but not yet started.
 */
type WaitingPromise = {
    resolve: (lock: Lock) => void
    reject: (err?: Error) => void
}


/**
 * A [[Semaphore]] is a tool that is used to control concurrent access to a common resource. This implementation
 * is used to apply a max-parallelism threshold.
 */
export class Semaphore {

    private running = 0
    private waiting: WaitingPromise[] = []
    private debugLogging = true

    constructor(private label: string, public max: number = 1) {
        if (max < 1) {
            throw new Error(
                `The ${label} semaphore was created with a max value of ${max} but the max value cannot be less than 1`,
            )
        }
    }

    /**
     * Allows the next task to start, if there are any waiting.
     */
    private take = () => {
        if (this.waiting.length > 0 && this.running < this.max) {
            this.running++

            // Get the next task from the queue
            const task = this.waiting.shift()

            // Resolve the promise to allow it to start, provide a release function
            if (task) task.resolve({ release: this.release })
        }
    }

    /**
     * Acquire a lock on the target resource.
     *
     * ! Returns a function to release the lock, it is critical that this function is called when the task is finished with the resource.
     */
    acquire = (): Promise<Lock> => {

        if (this.running < this.max) {
            this.running++
            return Promise.resolve({ release: this.release })
        }

        return new Promise<Lock>((resolve, reject) => {
            this.waiting.push({ resolve, reject })
        })
    }

    /**
     * Releases a lock held by a task. This function is returned from the acquire function.
     */
    private release = () => {
        this.running--
        this.take()
    }

    /**
     * Purge all waiting tasks from the [[Semaphore]]
     */
    purge = () => {
        if (this.debugLogging) {
            console.info(
                `Purge requested on the ${this.label} semaphore, ${this.waiting.length} pending tasks will be cancelled.`,
            )
        }

        this.waiting.forEach(task => {
            task.reject(
                new Error('The semaphore was purged and as a result this task has been cancelled'),
            )
        })

        this.running = 0
        this.waiting = []
    }
}

const ReadText = {
    readLines(ns: NS, file: string): string[] {
        return (ns.read(file) as string).split(/\r?\n/);
    },

    readNonEmptyLines(ns: NS, file: string): string[] {
        return ReadText.readLines(ns, file).filter(
            (x) => x.trim() != ""
        );
    },
};

const DownloadFiles = {
    async getfileToHome(ns: NS, source: string, dest: string) {
        const logger = new TermLogger(ns);
        logger.info(`Downloading ${source} -> ${dest}`);

        if (!(await ns.wget(source, dest, "home"))) {
            logger.err(`\tFailed retrieving ${source} -> ${dest}`);
        }
    },
};

abstract class Application<O> 
{
    protected _options: O; 
    protected _logger: Logger;
    protected _io: IO;
    protected _ns: NS;

    /**
     *
     */
    constructor(ns: NS, schema: ArgsSchema, logger: new (ns: NS) => Logger) {
        this._ns = ns;
        this._logger = new logger(ns);
        this._options = new Options<O>(ns,schema).options
        this._io = new IO(ns, this._logger)
    }

    abstract run() : Promise<void>

}

interface Logger {
    info(msg: string, ...args: string[]);
    warn(msg: string, ...args: string[]);
    err(msg: string, ...args: string[]);
    log(msg: string, ...args: string[]);
}

class TermLogger implements Logger {
    static INFO_LITERAL = "INFO   >";
    static WARN_LITERAL = "WARN   >";
    static ERR_LITERAL = "ERROR  >";
    static TRACE_LITERAL = "TRACE  >";
    ns: NS;

    constructor(ns: NS) {
        this.ns = ns;
    }

    info(msg: string, ...args: string[]) {
        this.ns.tprintf(`${TermLogger.INFO_LITERAL} ${msg}`, ...args);
    }

    warn(msg: string, ...args: string[]) {
        this.ns.tprintf(`${TermLogger.WARN_LITERAL} ${msg}`, ...args);
    }

    err(msg: string, ...args: string[]) {
        this.ns.tprintf(`${TermLogger.ERR_LITERAL} ${msg}`, ...args);
    }

    log(msg: string, ...args: string[]) {
        this.ns.tprintf(`${TermLogger.TRACE_LITERAL} ${msg}`, ...args);
    }
}

class Penetrator {
    ns: NS;
    private logger: Logger;
    /**
     *
     */
    constructor(ns: NS, logger: Logger) {
        this.ns = ns;
        this.logger = logger;
    }

    penetrate(host: string) {
        try { this.ns.brutessh(host); } catch { this.logger?.warn(`failed to brute force ssh on ${host}`); }
        try { this.ns.ftpcrack(host); } catch { this.logger?.warn(`failed to crack ftp on ${host}`); }
        try { this.ns.relaysmtp(host); } catch { this.logger?.warn(`failed to bypass smtp on ${host}`); }
        try { this.ns.httpworm(host); } catch { this.logger?.warn(`failed to crack http on ${host}`); }
        try { this.ns.sqlinject(host); } catch { this.logger?.warn(`failed to inject sql on ${host}`); }
        try { this.ns.nuke(host); } catch { this.logger?.err(`failed to penetrate ${host}`); return false; }
        this.logger?.info(`successfully penetrated ${host}`);
        return true;
    }

}

class Deployer {
    ns: NS;
    private logger: Logger;
    /**
     *
     */
    constructor(ns: NS, logger: Logger) {
        this.ns = ns;
        this.logger = logger;
    }

    async script(destination: string, script: string): Promise<Response<boolean>> {
        return await this.deploy(destination, ["/lib/Helpers.js", script]);
    }

    async deploy(destination: string, files: string[]): Promise<Response<boolean>> {
        let res = {} as Response<boolean>;
        this.logger.info(`deploying ${files.join(', ')} to ${destination}`)
        res.success = res.payload = await this.ns.scp(files, destination);
        return res;
    }
}

class Executor {
    ns: NS;
    private logger: Logger;
    /**
     *
     */
    constructor(ns: NS, logger: Logger) {
        this.ns = ns;
        this.logger = logger;
    }

    async execute(host: string, threads: number, script: string, args: Args): Promise<Response<ProcessInfo>> {
        return new Promise<Response<ProcessInfo>>((resolve, reject) => {
            let res = {} as Response<ProcessInfo>;
            res.payload.pid = this.ns.exec(script, host, threads, ...args);
            if (res.payload.pid != 0) {
                this.logger.info(`Started ${script} [${args.join(", ")}] on ${host}`);
                res.success = true;
                resolve(res);
            } else {
                this.logger.err(`Failed to start ${script} [${args.join(", ")}] on ${host}`);
                res.success = false;
                reject()
            }
        });
    }
}

interface Response<T> {
    success: boolean
    payload: T
    error: string
    id: string
}

class PortIO {
    private _port: NetscriptPort;
    /**
     *
     */
    constructor(ns: NS, port: number) {
        this._port = ns.getPortHandle(port);
    }

    write<T>(res: Response<T>) {
        this._port.write(JSON.stringify(res))
    }

    read() {
        var data = this._port.read();
        if(data[0] == 'N') { return null; }
        return JSON.parse(data as string)
    }
}

class IO {
    ns: NS;
    private logger: Logger;
    /**
     *
     */
    constructor(ns: NS, logger: Logger) {
        this.ns = ns;
        this.logger = logger;
    }

    async fread(handle: string): Promise<Response<string>> {
        this.logger.info(handle);
        return new Promise<Response<string>>((resolve, reject) => {
            let res = {} as Response<string>;
            res.payload = this.ns.read(handle);
            res.success = true;
            resolve(res);
        });
    }

    async exists(file: string): Promise<boolean> {
        return (await this.fread(file)).payload != "";
    }

    async fwrite(handle: string, data: string[], mode: "w" | "a" | undefined): Promise<Response<boolean>> {
        let res = {} as Response<boolean>;
        try {
            await this.ns.write(handle, data, mode ?? 'w');
        }
        catch {
            res.success = false;
            return res;
        }
        res.success = true;
        return res;
    }
}

class Evaluator extends Executor {
    deployer: Deployer;
    /**
     *
     */
    constructor(ns: NS, logger: Logger, deployer: Deployer) {
        super(ns, logger);
        this.deployer = deployer;
    }

    async evaluate<T>(host: string, operation: string) {
        return new Promise<Response<T>>((resolve, reject) => {
            let res = {} as Response<T>;
            res.error = "not implemented yet";
            resolve(res);
        });
        // generate script
        // deploy and execute script on host
        // wait until complete
    }
}

type Args = (string | number | boolean)[];

type ArgsSchema = [string, string | number | boolean | string[]][];

class Options<T> {
    options: T
    /**
     *
     */
    constructor(ns: NS, schema: ArgsSchema) {
        this.options = ns.flags(schema) as T;
    }
}

interface RepoSettings {
    baseUrl: string;
    manifestPath: string;
}

const repoSettings: RepoSettings = {
    baseUrl: "http://localhost:9182",
    manifestPath: "/resources/manifest.txt",
};

class RepoInit {
    ns: NS;
    logger: TermLogger;

    constructor(ns: NS, logger: TermLogger = new TermLogger(ns)) {
        this.ns = ns;
        this.logger = logger;
    }

    private static getSourceDestPair(line: string): { source: string; dest: string } | null {
        return line.startsWith("./")
            ? {
                source: `${repoSettings.baseUrl}${line.substring(1)}`,
                dest: line.substring(1),
            }
            : null;
    }

    async pullScripts() {
        await this.getManifest();
        await this.downloadAllFiles();
    }

    async getManifest() {
        const manifestUrl = `${repoSettings.baseUrl}${repoSettings.manifestPath}`;

        this.logger.info(`Getting manifest...`);

        await DownloadFiles.getfileToHome(
            this.ns,
            manifestUrl,
            repoSettings.manifestPath
        );
    }

    async downloadAllFiles() {
        const files = ReadText.readNonEmptyLines(
            this.ns,
            repoSettings.manifestPath
        );

        this.logger.info(`Contents of manifest:`);
        this.logger.info(`\t${files}`);

        for (let file of files) {
            const pair = RepoInit.getSourceDestPair(file);

            if (!pair) {
                this.logger.err(`Could not read line ${file}`);
            } else {
                await DownloadFiles.getfileToHome(this.ns, pair.source, pair.dest);
            }
        }
    }
}

export {
    ReadText,
    Logger,
    IO,
    TermLogger,
    Application,
    Penetrator,
    Deployer,
    PortIO,
    Response,
    Executor,
    Evaluator,
    Args,
    ArgsSchema,
    Options,
    RepoInit,
    DownloadFiles
};
